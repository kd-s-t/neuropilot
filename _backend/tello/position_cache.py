import math
import re
import os
MAX_DISTANCE_CM = int(os.environ.get("TELLO_MAX_DISTANCE_CM", "300"))
GO_SPEED = 50
CHUNK_CM = 400


def _parse_distance(cmd: str) -> int:
    m = re.search(r"\s+(\d+)\s*$", cmd.strip())
    return int(m.group(1)) if m else 20


def _parse_angle(cmd: str) -> int:
    m = re.search(r"\s+(\d+)\s*$", cmd.strip())
    return int(m.group(1)) if m else 90


class PositionCache:
    def __init__(self, max_distance_cm: int = MAX_DISTANCE_CM):
        self.max_distance_cm = max_distance_cm
        self._x = 0.0
        self._y = 0.0
        self._z = 0.0
        self._yaw = 0.0
        self._armed = False

    def state(self) -> dict:
        return {"x": self._x, "y": self._y, "z": self._z, "yaw": self._yaw}

    def distance_from_home(self) -> float:
        return math.hypot(self._x, self._y, self._z)

    def update_after_command(self, command: str) -> None:
        cmd = (command or "").strip().lower()
        if cmd == "takeoff":
            self._x = 0.0
            self._y = 0.0
            self._z = 0.0
            self._yaw = 0.0
            self._armed = True
            return
        if cmd in ("land", "emergency"):
            self._armed = False
            return
        if not self._armed:
            return
        rad = math.radians(self._yaw)
        c, s = math.cos(rad), math.sin(rad)
        if cmd.startswith("forward "):
            d = _parse_distance(command)
            self._x += d * c
            self._y += d * s
        elif cmd.startswith("back "):
            d = _parse_distance(command)
            self._x -= d * c
            self._y -= d * s
        elif cmd.startswith("left "):
            d = _parse_distance(command)
            self._x -= d * s
            self._y += d * c
        elif cmd.startswith("right "):
            d = _parse_distance(command)
            self._x += d * s
            self._y -= d * c
        elif cmd.startswith("up "):
            self._z += _parse_distance(command)
        elif cmd.startswith("down "):
            self._z -= _parse_distance(command)
        elif cmd.startswith("cw "):
            self._yaw += _parse_angle(command)
        elif cmd.startswith("ccw "):
            self._yaw -= _parse_angle(command)
        self._yaw = ((self._yaw % 360) + 360) % 360

    def should_return_home(self) -> bool:
        return self._armed and self.distance_from_home() > self.max_distance_cm

    def return_home_commands(self) -> list:
        if not self._armed or (self._x == 0 and self._y == 0 and self._z == 0):
            return []
        seq = []
        x, y, z, yaw = self._x, self._y, self._z, self._yaw
        dist_xy = math.hypot(x, y)
        if dist_xy > 20:
            angle_to_home_deg = math.degrees(math.atan2(-y, -x))
            delta_deg = (angle_to_home_deg - yaw + 540) % 360 - 180
            if abs(delta_deg) > 5:
                if delta_deg > 0:
                    seq.append(f"ccw {min(int(abs(delta_deg)), 360)}")
                else:
                    seq.append(f"cw {min(int(abs(delta_deg)), 360)}")
            while dist_xy > 20:
                step = min(CHUNK_CM, int(dist_xy))
                seq.append(f"forward {step}")
                dist_xy -= step
        if z > 20:
            seq.append(f"down {min(int(z), 500)}")
        return seq
