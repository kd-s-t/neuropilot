"""
/test/* API: exact copy of neruopilot-camera/backend/main.py
POST /test/connect, POST /test/disconnect, GET /test/video, GET /test/state, GET /test/status
cv2 is imported only when opening the stream so the app can start even if opencv/libiconv is broken in this env.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import socket
import time
import threading

router = APIRouter(prefix="/test", tags=["test_camera"])

cap = None
stream_active = False
last_error = None
_error_lock = threading.Lock()
tello_state = {}
_state_lock = threading.Lock()
_connect_lock = threading.Lock()
cancel_connect = False
STATE_PORT = 8890


def _set_error(msg):
    global last_error
    with _error_lock:
        last_error = msg
    if msg:
        print("ERROR: " + msg)


def _parse_state(payload: bytes):
    try:
        text = payload.decode("utf-8", errors="ignore").strip()
        out = {}
        for part in text.split(";"):
            part = part.strip()
            if ":" in part:
                k, v = part.split(":", 1)
                out[k.strip()] = v.strip()
        return out
    except Exception:
        return {}


def _state_listener():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("0.0.0.0", STATE_PORT))
    sock.settimeout(1.0)
    while True:
        try:
            data, _ = sock.recvfrom(1024)
            parsed = _parse_state(data)
            if parsed:
                with _state_lock:
                    tello_state.clear()
                    tello_state.update(parsed)
        except socket.timeout:
            continue
        except Exception:
            break
    sock.close()


_state_thread = threading.Thread(target=_state_listener, daemon=True)
_state_thread.start()


def send_tello_command(cmd):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(2)
        tello_address = ("192.168.10.1", 8889)
        sock.sendto(cmd.encode("utf-8"), tello_address)
        time.sleep(0.5)
        sock.close()
    except socket.timeout:
        _set_error("Tello command timeout: " + cmd)
        raise
    except OSError as e:
        _set_error("Tello command failed: " + cmd + " " + str(e))
        raise
    except Exception as e:
        _set_error("Tello command error: " + cmd + " " + str(e))
        raise


def _release_capture():
    global cap
    c = cap
    cap = None
    if c is not None:
        try:
            c.release()
        except Exception:
            pass


def _open_stream_thread():
    global cap, cancel_connect
    try:
        import cv2
        udp_url = "udp://@0.0.0.0:11111?fifo_size=500000&overrun_nonfatal=1"
        c = cv2.VideoCapture(udp_url, cv2.CAP_FFMPEG)
        if not c.isOpened():
            _set_error("VideoCapture failed to open udp://@0.0.0.0:11111")
            return
        try:
            c.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception as e:
            _set_error("VideoCapture set buffer failed: " + str(e))
        with _connect_lock:
            if cancel_connect:
                try:
                    c.release()
                except Exception:
                    pass
            else:
                cap = c
        if cap is c:
            deadline = time.time() + 2.0
            while time.time() < deadline and not cancel_connect:
                ok, _ = c.read()
                if ok:
                    break
                time.sleep(0.03)
    except Exception as e:
        _set_error("Open stream thread: " + str(e))


@router.post("/connect")
def connect_dji():
    global cancel_connect, stream_active, last_error
    try:
        import cv2
    except ImportError as e:
        raise HTTPException(status_code=503, detail=str(e))
    with _error_lock:
        last_error = None
    stream_active = True
    try:
        send_tello_command("command")
        send_tello_command("streamon")
    except Exception as e:
        stream_active = False
        raise HTTPException(status_code=503, detail=str(e))
    with _connect_lock:
        cancel_connect = False
    t = threading.Thread(target=_open_stream_thread, daemon=True)
    t.start()
    return {"status": "connected"}


@router.post("/disconnect")
def disconnect_dji():
    global cancel_connect, stream_active
    stream_active = False
    with _connect_lock:
        cancel_connect = True
    _release_capture()
    return {"status": "disconnected"}


def generate():
    fail_count = 0
    max_fails = 150
    log_fail_every = 30
    while stream_active:
        c = cap
        if c is None:
            time.sleep(0.2)
            continue
        try:
            success, frame = c.read()
        except Exception as e:
            _set_error("VideoCapture read: " + str(e))
            fail_count += 1
            if fail_count >= max_fails:
                _release_capture()
                break
            continue
        if not success:
            fail_count += 1
            if fail_count == 1 or fail_count % log_fail_every == 0:
                _set_error("VideoCapture read failed (count " + str(fail_count) + ")")
            if fail_count >= max_fails:
                _set_error("Video stream gave up after " + str(max_fails) + " failed reads")
                _release_capture()
                break
            continue
        fail_count = 0
        try:
            import cv2
            _, buffer = cv2.imencode(".jpg", frame)
        except Exception as e:
            _set_error("imencode: " + str(e))
            continue
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
        )


@router.get("/video")
def video():
    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@router.get("/state")
def get_state():
    with _state_lock:
        return dict(tello_state)


@router.get("/status")
def get_status():
    with _error_lock:
        err = last_error
    return {
        "last_error": err,
        "stream_active": stream_active,
        "video_capture_set": cap is not None,
    }
