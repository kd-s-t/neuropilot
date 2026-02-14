# Fix: ModuleNotFoundError and GET /robotic/info

## Problem
- Backend failed to start with `ModuleNotFoundError: No module named 'routers.robotic'`.
- `app.py` and `routers/__init__.py` imported and mounted `robotic_router`, but there was no `routers/robotic.py`, so GET `/robotic/info` was never registered and callers got 404.

## What we did

1. **Added the missing router module**  
   Created `_backend/routers/robotic.py` so the existing import and `app.include_router(robotic_router)` could resolve.

2. **Defined the robotic router**  
   - `APIRouter(prefix="/robotic", tags=["robotic"])` so all routes live under `/robotic`.
   - No change to `app.py` or `routers/__init__.py`; they were already correct.

3. **Implemented GET /info**  
   - Endpoint returns `{"connected": bool, "battery": int | null}`.
   - `connected` from `tello.is_connected()`.
   - When connected, `battery` from Tello `battery?` command; otherwise `null`.

## Result
- Backend starts without `ModuleNotFoundError`.
- GET `/robotic/info` returns 200 with `connected` and `battery`.
