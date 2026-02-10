"""
DJI Webhook Server
Receives commands from FastAPI and executes them on Tello drone.
Serves Tello camera stream as MJPEG at GET /video.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import asyncio
import threading
import uvicorn
from connection import DJIConnection
from commands import DJICommands
from position_cache import PositionCache
from video_stream import (
    start_receiver as video_start_receiver,
    stop_receiver as video_stop_receiver,
    get_latest_jpeg,
    is_receiver_running,
    has_received_frames as video_has_received_frames,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global tello_connection
    tello_connection = DJIConnection()
    if tello_connection.connect():
        print("✓ Connected to Tello drone")
    else:
        print("⚠️  Failed to connect to Tello - accepting API calls")
    video_start_receiver()
    yield
    video_stop_receiver()
    if tello_connection:
        tello_connection.disconnect()


app = FastAPI(title="DJI Tello Webhook Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

tello_connection: Optional[DJIConnection] = None
position_cache = PositionCache()

class CommandRequest(BaseModel):
    control_id: str
    value: Optional[int] = None

class CommandResponse(BaseModel):
    success: bool
    message: str
    command: Optional[str] = None
    response: Optional[str] = None

# Minimal 1x1 grey JPEG for MJPEG placeholder when no frame yet
_PLACEHOLDER_JPEG = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.7\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00\x3f\x00\xf7\xd2\x7f\xff\xd9"
)


@app.post("/command", response_model=CommandResponse)
async def execute_command(request: CommandRequest):
    """
    Execute a Tello command
    
    Called by FastAPI when brainwave pattern matches a control
    """
    global tello_connection
    
    # Convert control_id to Tello command (strip whitespace; case-insensitive in commands.py)
    control_id = (request.control_id or "").strip()
    command = DJICommands.get_command(control_id, request.value)
    
    if not command:
        return CommandResponse(
            success=False,
            message=f"Unknown control_id: {control_id}",
            command=None
        )
    
    # Check if Tello is connected
    if not tello_connection or not tello_connection.connected:
        print(f"Received: {control_id} -> {command}")
        return CommandResponse(
            success=True,
            message="Command received",
            command=command,
            response=None
        )
    
    try:
        response = tello_connection.send_command(command)
        position_cache.update_after_command(command)
        if position_cache.should_return_home():
            def run_return_home():
                for cmd in position_cache.return_home_commands():
                    try:
                        if tello_connection and tello_connection.connected:
                            tello_connection.send_command(cmd)
                            position_cache.update_after_command(cmd)
                    except Exception:
                        pass
            threading.Thread(target=run_return_home, daemon=True).start()
            print(f"✓ Executed: {control_id} -> {command} (response: {response}); return-to-home triggered")
        else:
            print(f"✓ Executed: {control_id} -> {command} (response: {response})")
        return CommandResponse(
            success=True,
            message="Command executed successfully",
            command=command,
            response=response
        )
    except Exception as e:
        print(f"✗ Error executing command: {e} (control_id={control_id}, command={command})")
        return CommandResponse(
            success=False,
            message=f"Error executing command: {str(e)}",
            command=command,
            response=None
        )

@app.post("/controls", response_model=CommandResponse)
async def execute_control(request: CommandRequest):
    """
    Execute a Tello control command
    
    Alias for /command endpoint
    """
    return await execute_command(request)

@app.get("/position")
async def get_position():
    s = position_cache.state()
    return {
        "x": s["x"],
        "y": s["y"],
        "z": s["z"],
        "yaw": s["yaw"],
        "distance_from_home_cm": round(position_cache.distance_from_home(), 1),
        "max_distance_cm": position_cache.max_distance_cm,
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    global tello_connection
    return {
        "status": "healthy",
        "tello_connected": tello_connection.connected if tello_connection else False,
        "video_receiver_running": is_receiver_running(),
        "video_has_frames": video_has_received_frames(),
    }


@app.get("/battery")
async def get_battery():
    """Query Tello battery percentage (0-100). Returns null when not connected."""
    global tello_connection
    if not tello_connection or not tello_connection.connected:
        return {"battery": None, "message": "Tello not connected"}
    try:
        r = tello_connection.send_command("battery?", timeout=3.0)
        if r is not None and r.isdigit():
            return {"battery": int(r), "message": "ok"}
        return {"battery": None, "message": r or "no response"}
    except Exception as e:
        return {"battery": None, "message": str(e)}

@app.get("/video")
async def video_stream():
    """MJPEG stream of Tello camera. Use streamon first and connect to Tello WiFi."""
    boundary = b"frame"

    async def generate():
        while True:
            jpeg = get_latest_jpeg() or _PLACEHOLDER_JPEG
            yield b"--" + boundary + b"\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(jpeg)).encode() + b"\r\n\r\n"
            yield jpeg
            yield b"\r\n"
            await asyncio.sleep(0.05)

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.post("/video/start")
async def video_start_stream():
    """Send streamon to Tello. If not connected, try to connect first (e.g. after connecting to Tello WiFi)."""
    global tello_connection
    if not tello_connection:
        raise HTTPException(status_code=503, detail="Tello not connected. Connect this device to Tello WiFi (192.168.10.x).")
    if not tello_connection.connected:
        tello_connection.disconnect()
        if tello_connection.connect():
            print("Tello video: reconnected to drone")
        else:
            raise HTTPException(status_code=503, detail="Tello not connected. Connect this device to Tello WiFi (192.168.10.x).")
    try:
        r = tello_connection.send_command("streamon")
        print("Tello video: streamon response:", r)
        return {"success": True, "message": "streamon sent", "response": r}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/video/stop")
async def video_stop_stream():
    """Send streamoff to Tello."""
    global tello_connection
    if not tello_connection or not tello_connection.connected:
        return {"success": False, "message": "Tello not connected"}
    try:
        r = tello_connection.send_command("streamoff")
        return {"success": True, "message": "streamoff sent", "response": r}
    except Exception as e:
        return {"success": False, "message": str(e)}


@app.get("/")
async def root():
    """Root endpoint with info"""
    return {
        "service": "DJI Tello Webhook Server",
        "endpoints": {
            "POST /command": "Execute Tello command",
            "POST /controls": "Execute Tello control",
            "GET /position": "Cached position (x,y,z,yaw) and return-home limit",
            "GET /video": "MJPEG Tello camera stream",
            "POST /video/start": "Send streamon to Tello",
            "POST /video/stop": "Send streamoff to Tello",
            "GET /health": "Health check",
            "GET /battery": "Tello battery % (0-100)",
            "GET /": "This info"
        }
    }

if __name__ == "__main__":
    print("Starting DJI Tello Webhook Server...")
    print("Webhook URL: http://localhost:8888/command")
    print("Note: Will accept commands even if Tello is not connected")
    uvicorn.run(app, host="0.0.0.0", port=8888)
