"""
Tello routes: connect/disconnect, command, video, battery, health.
Video pipeline must match neruopilot-camera/backend (working reference).
"""
import asyncio
import threading
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

import tello
from tello.video_stream import (
    start_receiver as video_start_receiver,
    stop_receiver as video_stop_receiver,
    start_ffmpeg_stream,
    stop_ffmpeg_stream,
    generate_ffmpeg_frames,
    is_ffmpeg_stream_available,
    is_ffmpeg_stream_active,
    get_latest_jpeg,
    is_receiver_running,
    has_received_frames as video_has_received_frames,
)

router = APIRouter(prefix="/tello", tags=["tello"])

_PLACEHOLDER_JPEG = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.7\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00\x3f\x00\xf7\xd2\x7f\xff\xd9"
)


class CommandRequest(BaseModel):
    control_id: str
    value: Optional[int] = None


class CommandResponse(BaseModel):
    success: bool
    message: str
    command: Optional[str] = None
    response: Optional[str] = None


_STANDARD_CONTROL_IDS = [
    ("Start", None),
    ("Left", 20),
    ("Right", 20),
    ("Reverse", 20),
    ("Forward", 20),
    ("Stop", None),
    ("Up", 20),
    ("Down", 20),
    ("Turn Left", 90),
    ("Turn Right", 90),
    ("Flip Left", None),
    ("Flip Right", None),
    ("Flip Forward", None),
    ("Flip Back", None),
]


@router.get("/commands")
def list_command_mappings():
    out = []
    for control_id, value in _STANDARD_CONTROL_IDS:
        cmd = tello.DJICommands.get_command(control_id, value)
        out.append({"control_id": control_id, "value": value, "sdk_command": cmd})
    return {"mappings": out}


@router.post("/connect")
async def connect_tello():
    try:
        if not tello.connect():
            raise HTTPException(status_code=503, detail="Tello not found. Connect this device to Tello WiFi (192.168.10.x).")
        conn = tello.get_connection()
        if conn and conn.connected:
            try:
                conn.send_command("streamon")
            except Exception:
                pass
        start_ffmpeg_stream()
        return {"status": "connected"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/disconnect")
async def disconnect_tello():
    stop_ffmpeg_stream()
    video_stop_receiver()
    tello.disconnect()
    return {"status": "disconnected"}


@router.post("/command", response_model=CommandResponse)
async def execute_command(request: CommandRequest):
    control_id = (request.control_id or "").strip()
    command = tello.DJICommands.get_command(control_id, request.value)
    if not command:
        return CommandResponse(
            success=False,
            message=f"Unknown control_id: {control_id}",
            command=None
        )
    if not tello.is_connected():
        return CommandResponse(
            success=True,
            message="Command received (Tello not connected)",
            command=command,
            response=None
        )
    try:
        response = tello.send_command(control_id, request.value)
        cache = tello.get_position_cache()
        if cache and cache.should_return_home():
            conn = tello.get_connection()
            def run_return_home():
                for cmd in cache.return_home_commands():
                    try:
                        if conn and conn.connected:
                            conn.send_command(cmd)
                            cache.update_after_command(cmd)
                    except Exception:
                        pass
            threading.Thread(target=run_return_home, daemon=True).start()
        return CommandResponse(
            success=True,
            message="Command executed successfully",
            command=command,
            response=response
        )
    except Exception as e:
        return CommandResponse(
            success=False,
            message=str(e),
            command=command,
            response=None
        )


@router.get("/health")
async def health():
    tello_connected = tello.is_connected()
    if tello_connected:
        conn = tello.get_connection()
        if conn:
            try:
                r = conn.send_command("battery?", timeout=2.0)
                if r is None or not r.isdigit():
                    tello.disconnect()
                    tello_connected = False
            except Exception:
                tello.disconnect()
                tello_connected = False
    return {
        "status": "healthy",
        "tello_connected": tello_connected,
        "video_receiver_running": is_receiver_running(),
        "video_has_frames": video_has_received_frames() or is_ffmpeg_stream_available(),
    }


@router.get("/battery")
async def battery():
    if not tello.is_connected():
        return {"battery": None, "message": "Tello not connected"}
    try:
        r = tello.get_connection().send_command("battery?", timeout=3.0)
        if r is not None and r.isdigit():
            return {"battery": int(r), "message": "ok"}
        return {"battery": None, "message": r or "no response"}
    except Exception as e:
        return {"battery": None, "message": str(e)}


def _generate_mjpeg():
    for jpeg in generate_ffmpeg_frames():
        yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"


@router.get("/video")
async def video_stream():
    if is_ffmpeg_stream_active():
        return StreamingResponse(
            _generate_mjpeg(),
            media_type="multipart/x-mixed-replace; boundary=frame",
        )
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


@router.post("/video/start")
async def video_start():
    if not tello.is_connected():
        if not tello.connect():
            raise HTTPException(status_code=503, detail="Tello not connected. Connect this device to Tello WiFi (192.168.10.x).")
    try:
        r = tello.get_connection().send_command("streamon")
        start_ffmpeg_stream()
        return {"success": True, "message": "streamon sent", "response": r}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/video/stop")
async def video_stop():
    if not tello.is_connected():
        return {"success": False, "message": "Tello not connected"}
    try:
        r = tello.get_connection().send_command("streamoff")
        return {"success": True, "message": "streamoff sent", "response": r}
    except Exception as e:
        return {"success": False, "message": str(e)}


@router.get("/position")
async def position():
    cache = tello.get_position_cache()
    if not cache:
        return {"x": 0, "y": 0, "z": 0, "yaw": 0, "distance_from_home_cm": 0, "max_distance_cm": 300}
    s = cache.state()
    return {
        "x": s["x"],
        "y": s["y"],
        "z": s["z"],
        "yaw": s["yaw"],
        "distance_from_home_cm": round(cache.distance_from_home(), 1),
        "max_distance_cm": cache.max_distance_cm,
    }
