from fastapi import APIRouter
from controllers import EEGController, EventController
from routers.websocket import clients
import os
import threading

router = APIRouter(prefix="/eeg", tags=["eeg"])

# Shared instances (will be initialized in app.py)
eeg_controller = None
event_controller = None

@router.get("/events")
async def get_events():
    global event_controller
    if event_controller:
        return {"events": event_controller.get_events()}
    return {"events": []}

@router.get("/brainwaves")
def get_brainwaves():
    global eeg_controller
    if eeg_controller:
        return eeg_controller.get_brainwaves()
    return []

@router.get("/status")
def get_status():
    """Get EEG connection status and current band powers"""
    global eeg_controller
    try:
        if not eeg_controller:
            return {
                "connected": False,
                "message": "EEG controller not initialized",
                "band_powers": {},
                "sample_count": 0,
                "has_data": False,
            }
        is_connected = eeg_controller.inlet is not None
        band_powers = eeg_controller.get_band_powers()
        sample_count = len(eeg_controller.brainwave_data)
        return {
            "connected": is_connected,
            "message": "Connected to EEG stream" if is_connected else "Not connected to EEG stream",
            "sample_count": sample_count,
            "band_powers": band_powers,
            "has_data": sample_count > 0,
        }
    except Exception as e:
        return {
            "connected": False,
            "message": "EEG status temporarily unavailable",
            "band_powers": {},
            "sample_count": 0,
            "has_data": False,
        }

@router.get("/log_action")
def get_logs():
    global event_controller
    if event_controller:
        return {"logs": event_controller.get_logs()}
    return {"logs": []}

@router.post("/reconnect")
def reconnect_muse():
    """Reconnect to LSL stream (useful if streamer starts after backend)"""
    import platform
    global eeg_controller
    print("=" * 60)
    print("RECONNECT ENDPOINT CALLED - Attempting to connect to EEG stream...")
    print("=" * 60)
    
    if not eeg_controller:
        print("ERROR: EEG controller not initialized")
        return {"success": False, "message": "EEG controller not initialized"}
    
    platform_name = "mac" if platform.system() == "Darwin" else "windows" if platform.system() == "Windows" else "linux"
    streamer = "muselsl" if platform_name == "mac" else "bluemuse" if platform_name == "windows" else "muselsl"
    
    # Close existing connection if any
    if eeg_controller.inlet:
        try:
            print("Closing existing inlet connection...")
            eeg_controller.inlet = None
        except Exception as e:
            print(f"Error closing inlet: {e}")
    
    # Check environment variables
    print(f"DYLD_LIBRARY_PATH: {os.environ.get('DYLD_LIBRARY_PATH', 'NOT SET')}")
    print(f"DYLD_FRAMEWORK_PATH: {os.environ.get('DYLD_FRAMEWORK_PATH', 'NOT SET')}")
    
    # Try to connect with longer timeout (muselsl can take ~12s to start on Mac)
    print("Calling connect_to_muse(timeout=20)...")
    success = eeg_controller.connect_to_muse(timeout=20)
    
    if success:
        print("=" * 60)
        print("✓ SUCCESS: Connected to EEG stream!")
        print("=" * 60)
        
        # Start the read_brainwaves thread if not already running
        # Check if thread is already running by checking if we have a reading thread
        # We'll start it here to ensure samples are being read
        def start_reading_brainwaves():
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(eeg_controller.read_brainwaves(clients=clients))
        
        # Start reading thread
        reading_thread = threading.Thread(target=start_reading_brainwaves)
        reading_thread.daemon = True
        reading_thread.start()
        print("Started brainwave reading thread")
        
        return {"success": True, "message": f"Connected to EEG stream on {platform_name}"}
    else:
        print("=" * 60)
        print("✗ FAILED: Could not find EEG stream")
        print("=" * 60)
        return {"success": False, "message": f"Could not find EEG stream. Make sure {streamer} is running and streaming on {platform_name}."}
