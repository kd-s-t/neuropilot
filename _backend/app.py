import random
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import threading
import numpy as np
import os
from config import init_db, get_db
from routers import auth_router, eeg_router, websocket_router, training_router, machine_router, suggestions_router
from routers.websocket import clients, has_control_trigger_subscribers
from routers.health import router as health_router
from controllers import EEGController, EventController
from controllers.machine_control_service import MachineControlService

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

eeg_controller = EEGController()
event_controller = EventController()

# Set shared instances for routers
from routers import eeg as eeg_router_module, websocket as ws_router_module
eeg_router_module.eeg_controller = eeg_controller
eeg_router_module.event_controller = event_controller
ws_router_module.eeg_controller = eeg_controller
ws_router_module.event_controller = event_controller
ws_router_module.clients = clients

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(eeg_router)
app.include_router(websocket_router)
app.include_router(training_router)
app.include_router(machine_router)
app.include_router(suggestions_router)

# Mount static files for blueprints
blueprints_dir = "blueprints"
os.makedirs(blueprints_dir, exist_ok=True)
app.mount("/blueprints", StaticFiles(directory=blueprints_dir), name="blueprints")

WISDOM = [
    "The mind is everything. What you think you become.",
    "Knowing yourself is the beginning of all wisdom.",
    "The only true wisdom is in knowing you know nothing.",
    "Wisdom is not a product of schooling but of the attempt to acquire it.",
    "The quieter you become, the more you can hear.",
]

@app.get("/")
def root():
    return {"message": random.choice(WISDOM)}

def process_eeg_data():
    """Process EEG data and detect events only when simulator is open (control-triggers WS). Throttled to every 5s."""
    import time
    last_detect = 0
    interval = 5.0
    while True:
        now = time.monotonic()
        if (has_control_trigger_subscribers() and eeg_controller.inlet is not None
                and len(eeg_controller.buffer) >= eeg_controller.buffer_size and (now - last_detect) >= interval):
            last_detect = now
            segment = np.array(eeg_controller.buffer[-eeg_controller.buffer_size:]).reshape(1, -1)
            eeg_controller.buffer = eeg_controller.buffer[-eeg_controller.buffer_size:]
            event_controller.detect_events(segment)
        time.sleep(0.1)

async def process_machine_controls():
    """Process brainwave patterns and trigger machine controls via webhooks"""
    import asyncio
    from sqlalchemy.orm import Session
    from models import User
    
    while True:
        try:
            # Get current band powers
            band_powers = eeg_controller.get_band_powers()
            
            if band_powers:
                # Get database session
                db = next(get_db())
                try:
                    users = db.query(User).filter(User.is_active == True).all()
                    from routers.websocket import broadcast_control_triggered
                    for user in users:
                        try:
                            service = MachineControlService(db)
                            await service.process_band_powers(
                                band_powers,
                                user_id=user.id,
                                on_trigger=broadcast_control_triggered,
                            )
                        except ValueError:
                            pass
                finally:
                    db.close()
            
            await asyncio.sleep(0.1)
        except ValueError:
            await asyncio.sleep(1)
        except Exception as e:
            print(f"Error in process_machine_controls: {e}")
            await asyncio.sleep(1)

def start_reading_brainwaves():
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(eeg_controller.read_brainwaves(clients=clients))

def try_connect_eeg_and_start_reading(timeout=20):
    """Connect to EEG stream and start reading thread. Returns True if connected."""
    if not eeg_controller.connect_to_muse(timeout=timeout):
        return False
    thread = threading.Thread(target=start_reading_brainwaves)
    thread.daemon = True
    thread.start()
    return True


async def background_eeg_reconnect():
    """When no inlet, retry connecting every 15s so starting muselsl after backend still works."""
    import asyncio
    from routers.websocket import clients
    while True:
        await asyncio.sleep(15)
        if eeg_controller.inlet is not None:
            continue
        # Avoid starting a second reading thread; reconnect endpoint starts it
        if eeg_controller.connect_to_muse(timeout=5):
            thread = threading.Thread(target=start_reading_brainwaves)
            thread.daemon = True
            thread.start()
            print("EEG stream connected via background reconnect.")


@app.on_event("startup")
async def startup_event():
    import platform
    import asyncio
    init_db()
    
    platform_name = "mac" if platform.system() == "Darwin" else "windows" if platform.system() == "Windows" else "linux"
    print(f"Platform: {platform_name}")
    
    # Do not search for Muse at startup; use POST /eeg/reconnect when muselsl is running
    event_thread = threading.Thread(target=process_eeg_data)
    event_thread.daemon = True
    event_thread.start()

    def start_machine_controls():
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(process_machine_controls())

    control_thread = threading.Thread(target=start_machine_controls)
    control_thread.daemon = True
    control_thread.start()

    # No background EEG reconnect; use POST /eeg/reconnect when Muse is needed

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
