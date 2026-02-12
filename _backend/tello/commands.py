from typing import Dict, Optional

class DJICommands:
    DEFAULT_MAPPINGS: Dict[str, str] = {
        "takeoff": "takeoff",
        "forward": "forward",
        "back": "back",
        "left": "left",
        "right": "right",
        "up": "up",
        "rotate_cw": "cw",
        "rotate_ccw": "ccw",
        "turnleft": "ccw",
        "turnright": "cw",
        "turn_left": "ccw",
        "turn_right": "cw",
        "start": "takeoff",
        "reverse": "back",
        "flip_left": "flip l",
        "flip_right": "flip r",
        "flip_forward": "flip f",
        "flip_back": "flip b",
        "emergency": "emergency",
        "streamon": "streamon",
        "streamoff": "streamoff",
    }
    DEFAULT_DISTANCE = 20
    DEFAULT_ANGLE = 90

    @staticmethod
    def get_command(control_id: str, value: Optional[int] = None) -> Optional[str]:
        control_lower = (control_id or "").strip().lower()
        if control_lower in ("down", "descend", "lower"):
            distance = value if value is not None else DJICommands.DEFAULT_DISTANCE
            return f"down {distance}"
        if control_lower in ("stop", "land"):
            return "land"
        if control_lower in DJICommands.DEFAULT_MAPPINGS:
            base_command = DJICommands.DEFAULT_MAPPINGS[control_lower]
            if base_command in ["forward", "back", "left", "right", "up", "down"]:
                distance = value if value is not None else DJICommands.DEFAULT_DISTANCE
                return f"{base_command} {distance}"
            elif base_command in ["cw", "ccw"]:
                angle = value if value is not None else DJICommands.DEFAULT_ANGLE
                return f"{base_command} {angle}"
            else:
                return base_command
        if "rotate" in control_lower or "turn" in control_lower:
            if "cw" in control_lower or "clockwise" in control_lower or "right" in control_lower:
                angle = value if value is not None else DJICommands.DEFAULT_ANGLE
                return f"cw {angle}"
            elif "ccw" in control_lower or "counter" in control_lower or "left" in control_lower:
                angle = value if value is not None else DJICommands.DEFAULT_ANGLE
                return f"ccw {angle}"
        if "forward" in control_lower or "fwd" in control_lower:
            distance = value if value is not None else DJICommands.DEFAULT_DISTANCE
            return f"forward {distance}"
        elif "back" in control_lower or "backward" in control_lower or "reverse" in control_lower:
            distance = value if value is not None else DJICommands.DEFAULT_DISTANCE
            return f"back {distance}"
        elif "left" in control_lower:
            distance = value if value is not None else DJICommands.DEFAULT_DISTANCE
            return f"left {distance}"
        elif "right" in control_lower:
            distance = value if value is not None else DJICommands.DEFAULT_DISTANCE
            return f"right {distance}"
        elif "up" in control_lower or "lift" in control_lower:
            distance = value if value is not None else DJICommands.DEFAULT_DISTANCE
            return f"up {distance}"
        elif "down" in control_lower or "lower" in control_lower:
            distance = value if value is not None else DJICommands.DEFAULT_DISTANCE
            return f"down {distance}"
        elif "flip" in control_lower:
            if "left" in control_lower or control_lower == "flip_l":
                return "flip l"
            if "right" in control_lower or control_lower == "flip_r":
                return "flip r"
            if "forward" in control_lower or "fwd" in control_lower or control_lower == "flip_f":
                return "flip f"
            if "back" in control_lower or control_lower == "flip_b":
                return "flip b"
        elif "emergency" in control_lower:
            return "emergency"
        elif "streamon" in control_lower or "stream_on" in control_lower:
            return "streamon"
        elif "streamoff" in control_lower or "stream_off" in control_lower:
            return "streamoff"
        return None
