from fastapi import APIRouter
import tello

router = APIRouter(prefix="/robotic", tags=["robotic"])


@router.get("/info")
def robotic_info():
    connected = tello.is_connected()
    battery = None
    if connected:
        try:
            resp = tello.send_command("battery?", None)
            if resp and resp.isdigit():
                battery = int(resp)
        except Exception:
            pass
    return {"connected": connected, "battery": battery}
