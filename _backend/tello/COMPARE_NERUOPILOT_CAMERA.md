# neuropilot vs neruopilot-camera

## Overview

| | **neuropilot** | **neruopilot-camera** |
|---|----------------|------------------------|
| **Purpose** | Full app: EEG → training → machine bindings → Tello + 3D sim | Tello camera only |
| **Backend** | FastAPI monolith (auth, DB, EEG, machines, tello router) | Single `main.py` (~210 lines) |
| **Structure** | `_backend/` (routers, controllers, tello/, models) + `_frontend/` | `backend/main.py` + `frontend/` |
| **Tello API** | Under `/tello/*` (connect, disconnect, command, video, battery, health, position) | `/connect`, `/disconnect`, `/video`, `/state`, `/status` |

## Tello connection

| | **neuropilot** | **neruopilot-camera** |
|---|----------------|------------------------|
| **How** | Persistent `DJIConnection`: one UDP socket bound to 8889, `send_command()` waits for response | Ephemeral: `send_tello_command(cmd)` creates socket, sends to 192.168.10.1:8889, sleeps 0.5s, closes |
| **Connect** | `tello.connect()` → socket + `send_command("command")` then router sends `streamon` | `send_tello_command("command")` then `send_tello_command("streamon")` |
| **Order** | connect → streamon → start_ffmpeg_stream() (with 2s delay) | command → streamon → start thread that opens VideoCapture (no delay) |

## Video pipeline (the part that must match)

| | **neuropilot** | **neruopilot-camera** |
|---|----------------|------------------------|
| **Open** | `cv2.VideoCapture("udp://@0.0.0.0:11111", cv2.CAP_FFMPEG)` in a daemon thread, after 2s delay | Same URL/cap in daemon thread, no delay |
| **Thread** | `_open_ffmpeg_stream_thread()`: delay → open cap → set `_cap_ffmpeg` under locks | `_open_stream_thread()`: open cap → set global `cap` under `_connect_lock` |
| **Generator** | `generate_ffmpeg_frames()`: while active, `cap.read()` → `imencode` → yield jpeg bytes | `generate()`: while `stream_active`, `cap.read()` → `imencode` → yield `--frame\r\n...` + jpeg |
| **MJPEG** | `StreamingResponse(_generate_mjpeg(), boundary=frame)` when `is_ffmpeg_stream_active()` | `StreamingResponse(generate(), boundary=frame)` |
| **Extra** | Idempotent start, “first frame received” flag, fallback to old UDP/PyAV path and placeholder | Single path; `stream_active` and `cap` only |

## Differences that can affect behavior

1. **Delay** – neuropilot waits 2s after streamon before opening VideoCapture; neruopilot-camera opens immediately. If Tello is slow to start streaming, delay can help; if it starts fast, delay can be unnecessary.
2. **Connection type** – neuropilot keeps one socket and reuses it; neruopilot-camera uses a new socket per command. Both send to 192.168.10.1:8889.
3. **Single app vs embedded** – neruopilot-camera runs as its own process (e.g. port 8001). neuropilot runs tello inside the same process as auth, DB, EEG. Same OpenCV/FFmpeg pipeline otherwise.
4. **Cap lifecycle** – neruopilot-camera: one global `cap`, set in thread, read in `generate()`. neuropilot: `_cap_ffmpeg` under locks, read in `generate_ffmpeg_frames()`. Logic is equivalent; neuropilot adds idempotency and “has frames” flag.

## API mapping

| neruopilot-camera | neuropilot |
|-------------------|------------|
| POST /connect     | POST /tello/connect |
| POST /disconnect  | POST /tello/disconnect |
| GET /video        | GET /tello/video |
| GET /state        | (none; Tello state not mirrored) |
| GET /status       | GET /tello/health |

## Reference

- Working video: **neruopilot-camera/backend/main.py**
- neuropilot Tello video: **_backend/tello/video_stream.py** (FFmpeg block at top), **_backend/routers/tello.py**
