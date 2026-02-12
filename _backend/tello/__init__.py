from tello.connection import DJIConnection
from tello.commands import DJICommands
from tello.position_cache import PositionCache
from tello.video_stream import (
    start_receiver as video_start_receiver,
    stop_receiver as video_stop_receiver,
    get_latest_jpeg,
    is_receiver_running,
    has_received_frames as video_has_received_frames,
)

_connection = None
_position_cache = None


def get_connection():
    return _connection


def get_position_cache():
    return _position_cache


def connect(timeout=10):
    global _connection, _position_cache
    if _connection is not None and _connection.connected:
        return True
    _position_cache = PositionCache()
    _connection = DJIConnection()
    if _connection.connect():
        return True
    return False


def disconnect():
    global _connection
    if _connection:
        _connection.disconnect()
        _connection = None
    video_stop_receiver()


def is_connected():
    return _connection is not None and _connection.connected


def send_command(control_id: str, value=None):
    if not _connection or not _connection.connected:
        return None
    command = DJICommands.get_command(control_id, value)
    if not command:
        return None
    response = _connection.send_command(command)
    if _position_cache:
        _position_cache.update_after_command(command)
    return response
