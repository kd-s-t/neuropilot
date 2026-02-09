from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import json
from datetime import datetime
from controllers import EEGController, EventController

router = APIRouter(tags=["websocket"])

# Shared instances (will be initialized in app.py)
eeg_controller = None
event_controller = None
clients = []

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    global eeg_controller, clients
    await websocket.accept()
    clients.append(websocket)
    print("WebSocket /ws connection established")
    try:
        while True:
            if eeg_controller and eeg_controller.brainwave_data:
                latest_data = eeg_controller.brainwave_data[-1]
                try:
                    await websocket.send_text(json.dumps(latest_data))
                except WebSocketDisconnect:
                    break
            else:
                placeholder_data = {
                    "timestamp": datetime.now().timestamp(),
                    "sample": [0.0] * 4
                }
                try:
                    await websocket.send_text(json.dumps(placeholder_data))
                except WebSocketDisconnect:
                    break
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in clients:
            clients.remove(websocket)
        print("WebSocket /ws connection closed")

@router.websocket("/ws/eeg")
async def websocket_eeg_endpoint(websocket: WebSocket):
    global eeg_controller
    await websocket.accept()
    print("WebSocket /ws/eeg connection established")
    message_count = 0
    try:
        while True:
            if eeg_controller:
                band_powers = eeg_controller.get_band_powers()
                # Log first message and then every 50 messages (every 5 seconds)
                if message_count == 0 or message_count % 50 == 0:
                    max_power = max([v.get('power', 0) for v in band_powers.values()]) if band_powers else 0
                    print(f"WebSocket /ws/eeg sending band powers (msg #{message_count}): max power = {max_power:.2f}, inlet = {eeg_controller.inlet is not None}")
                await websocket.send_json(band_powers)
            else:
                if message_count == 0:
                    print("WebSocket /ws/eeg: eeg_controller is None, sending empty data")
                await websocket.send_json({})
            message_count += 1
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        print("WebSocket /ws/eeg connection closed")
    except Exception as e:
        print(f"Error in /ws/eeg: {e}")
