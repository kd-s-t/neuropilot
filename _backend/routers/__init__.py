from .auth import router as auth_router
from .eeg import router as eeg_router
from .websocket import router as websocket_router
from .training import router as training_router
from .machine import router as machine_router
from .suggestions import router as suggestions_router
from .ai import router as ai_router
from .tello import router as tello_router
from .test_camera import router as test_camera_router

__all__ = ["auth_router", "eeg_router", "websocket_router", "training_router", "machine_router", "suggestions_router", "ai_router", "tello_router", "test_camera_router"]
