"""
Machine Control Service
Detects brainwave patterns and triggers machine controls via webhooks.

Match modes (env MATCH_MODE):
- strict: relative-vector similarity >= 0.75 (shape of distribution).
- approximate: relative-vector similarity >= 0.60 (looser shape match).
- ordinal: match when band order is preserved (e.g. training beta>theta and live beta>theta).
  Absolute values ignored; e.g. saved beta=100 theta=10, live beta=1000 theta=100 still matches.
"""

import os
import base64
import httpx
import asyncio
import json
import re
from typing import Dict, List, Optional, Any, Set
from datetime import datetime
from collections import defaultdict
from sqlalchemy.orm import Session
from models import Machine, MachineControlBinding, TrainingSession, MachineLog
from controllers import MachineController

SIMILARITY_STRICT = 0.75
WEBHOOK_ERROR_LOG_INTERVAL = 60.0
_last_webhook_error_log: Dict[str, datetime] = {}
SIMILARITY_APPROXIMATE = 0.60
_SENTINEL_OLD = datetime(1970, 1, 1)
_global_last_trigger: Dict[str, datetime] = {}
_MIN_TRIGGER_INTERVAL = 3.0
ACCUMULATOR_SIZE = 5
_ACTION_ACCUMULATOR: Dict[str, List[str]] = defaultdict(list)
_simulate_machine_connections: Dict[int, Set[int]] = defaultdict(set)


def register_simulate(machine_id: int, connection_id: int) -> None:
    _simulate_machine_connections[machine_id].add(connection_id)


def unregister_simulate(machine_id: int, connection_id: int) -> None:
    _simulate_machine_connections[machine_id].discard(connection_id)


def is_machine_in_simulate_mode(machine_id: int) -> bool:
    return len(_simulate_machine_connections.get(machine_id, set())) > 0
_CONTROL_ID_TO_LABEL: Dict[str, str] = {
    "turn_left": "left", "turn left": "left", "turnright": "right", "turn_right": "right", "turn right": "right",
    "left": "left", "right": "right", "forward": "forward", "back": "back", "reverse": "back",
    "up": "up", "down": "down", "cw": "right", "ccw": "left", "rotate_cw": "right", "rotate_ccw": "left",
}

EVENT_TO_CONTROL = {
    "Look Right": "Turn Right",
    "Blink": "Forward",
    "Nod": "Up",
}

def _control_id_matches(control: dict, canonical: str) -> bool:
    cid = (control.get("id") or "").strip()
    if not cid:
        return False
    if cid == canonical:
        return True
    low = cid.lower().replace(" ", "_")
    can_low = canonical.lower().replace(" ", "_")
    return low == can_low or cid.lower() == canonical.lower()


def _session_name_normalize(name: str) -> str:
    return (name or "").strip().lower().replace(" ", "_").replace("_loop", "")


def _event_name_to_session_name_candidates(event_name: str) -> list:
    s = (event_name or "").strip()
    if not s:
        return []
    out = [s]
    no_loop = s.replace(" loop", "").strip()
    if no_loop and no_loop != s:
        out.append(no_loop)
    first = s.split()[0] if s.split() else s
    if first and first not in out:
        out.append(first)
    return out


def _control_id_to_label(control_id: str) -> str:
    key = (control_id or "").strip().lower().replace(" ", "_")
    if key in _CONTROL_ID_TO_LABEL:
        return _CONTROL_ID_TO_LABEL[key]
    for k, v in _CONTROL_ID_TO_LABEL.items():
        if k.replace("_", " ") in key or key in k:
            return v
    return key.replace("_", " ") or "unknown"


def _get_drone_state() -> Dict[str, Any]:
    out: Dict[str, Any] = {"position": {}, "battery": None, "distance_from_home_cm": None, "max_distance_cm": None}
    try:
        import tello as tello_module
        cache = tello_module.get_position_cache()
        if cache:
            out["position"] = cache.state()
            out["distance_from_home_cm"] = round(cache.distance_from_home(), 1)
            out["max_distance_cm"] = getattr(cache, "max_distance_cm", 300)
        conn = tello_module.get_connection()
        if conn and conn.connected:
            r = conn.send_command("battery?", timeout=2.0)
            if r and r.isdigit():
                out["battery"] = int(r)
    except Exception:
        pass
    return out


def _get_camera_base64() -> Optional[str]:
    try:
        from tello.video_stream import get_latest_jpeg
        jpeg = get_latest_jpeg()
        if jpeg:
            return base64.b64encode(jpeg).decode("ascii")
    except Exception:
        pass
    return None


def _get_latest_jpeg_bytes() -> Optional[bytes]:
    try:
        from tello.video_stream import get_latest_jpeg
        return get_latest_jpeg()
    except Exception:
        pass
    return None


_YOLO_MODEL = None


def _run_yolo(jpeg_bytes: bytes) -> str:
    global _YOLO_MODEL
    if not jpeg_bytes:
        return "no frame"
    try:
        import numpy as np
        try:
            import cv2
        except ImportError:
            cv2 = None
        if cv2 is None:
            return "no cv2"
        buf = np.frombuffer(jpeg_bytes, dtype=np.uint8)
        img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        if img is None:
            return "decode failed"
        try:
            from ultralytics import YOLO
        except ImportError:
            return "yolo not installed"
        if _YOLO_MODEL is None:
            _YOLO_MODEL = YOLO("yolov8n.pt")
        results = _YOLO_MODEL.predict(source=img, conf=0.25, verbose=False)
        parts = []
        h, w = img.shape[:2]
        for r in results:
            if r.boxes is None:
                continue
            for box in r.boxes:
                cls_id = int(box.cls[0])
                name = r.names.get(cls_id, "object")
                conf = float(box.conf[0])
                xyxy = box.xyxy[0]
                cx = (float(xyxy[0]) + float(xyxy[2])) / 2
                cy = (float(xyxy[1]) + float(xyxy[3])) / 2
                if cx < w * 0.33:
                    zone = "left"
                elif cx > w * 0.66:
                    zone = "right"
                else:
                    zone = "center"
                parts.append(f"{name} {zone}")
        if not parts:
            return "no obstacles"
        return ", ".join(parts[:10])
    except Exception:
        return "yolo error"


def _openai_decide(
    actions: List[str],
    drone_state: Dict[str, Any],
    camera_b64: Optional[str],
    obstacles: Optional[str] = None,
) -> List[Dict[str, Any]]:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return [{"control_id": (actions[0] if actions else "land"), "value": 20}] if actions else []
    _skip = ("no frame", "no cv2", "yolo not installed", "yolo error", "decode failed")
    obs_for_prompt = obstacles if obstacles and obstacles not in _skip else None
    obs_text = f" Camera obstacles (YOLO): {obs_for_prompt}." if obs_for_prompt else ""
    prompt = (
        "You are a safety pilot for a Tello drone. The user controls the drone with brainwaves; the last %d intended actions (in order) are: %s. "
        "Drone state: position (x,y,z cm, yaw deg): %s, battery: %s, distance_from_home_cm: %s, max_distance_cm: %s.%s "
        "Decide what the user is trying to do and output ONE or a few Tello commands that are safe: respect boundaries (stay within max_distance_cm), avoid obstacles, and low battery. "
        "Allowed control_id: forward, back, left, right, up, down, cw, ccw, land. Use value in 20-100 for distance (cm) or angle (deg). "
        "If unsafe (obstacle, boundary, low battery), output land or a single safe move. Reply with ONLY a JSON object, no markdown: {\"commands\": [{\"control_id\": \"left\", \"value\": 30}, ...]}."
    ) % (
        len(actions),
        ", ".join(actions),
        drone_state.get("position", {}),
        drone_state.get("battery"),
        drone_state.get("distance_from_home_cm"),
        drone_state.get("max_distance_cm"),
        obs_text,
    )
    messages: List[Dict[str, Any]] = [{"role": "user", "content": prompt}]
    if camera_b64 and not obs_for_prompt:
        messages[0]["content"] = [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{camera_b64}"}},
        ]
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model=os.environ.get("OPENAI_DRONE_MODEL", "gpt-4o-mini"),
            messages=messages,
            max_tokens=500,
        )
        text = (resp.choices[0].message.content or "").strip()
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            data = json.loads(match.group())
            cmds = data.get("commands")
            if isinstance(cmds, list):
                return [c for c in cmds if isinstance(c, dict) and c.get("control_id")]
    except Exception:
        pass
    return [{"control_id": (actions[0] if actions else "land"), "value": 20}] if actions else []


async def _execute_accumulated_impl(
    db: Session,
    machine_id: int,
    actions: List[str],
    on_trigger=None,
) -> None:
    drone_state = _get_drone_state()
    use_yolo = not is_machine_in_simulate_mode(machine_id)
    jpeg_bytes = _get_latest_jpeg_bytes() if use_yolo else None
    obstacles = _run_yolo(jpeg_bytes) if jpeg_bytes else None
    camera_b64 = base64.b64encode(jpeg_bytes).decode("ascii") if jpeg_bytes else None
    commands = _openai_decide(actions, drone_state, camera_b64, obstacles=obstacles)
    import tello as tello_module
    for c in commands:
        control_id = (c.get("control_id") or "land").strip()
        value = c.get("value") if isinstance(c.get("value"), (int, float)) else 20
        try:
            response = tello_module.send_command(control_id, int(value))
            success = response is not None
            log = MachineLog(
                machine_id=machine_id,
                control_id=control_id,
                webhook_url="internal://tello",
                value=int(value),
                success=success,
                status_code=200 if success else None,
                error_message=None,
                response_data=response,
            )
            db.add(log)
            db.commit()
        except Exception as e:
            log = MachineLog(
                machine_id=machine_id,
                control_id=control_id,
                webhook_url="internal://tello",
                value=int(value) if isinstance(value, (int, float)) else None,
                success=False,
                status_code=None,
                error_message=str(e)[:500],
                response_data=None,
            )
            db.add(log)
            db.commit()
        if on_trigger:
            try:
                await on_trigger(machine_id, control_id, int(value) if isinstance(value, (int, float)) else None)
            except Exception:
                pass
        await asyncio.sleep(0.2)


class MachineControlService:
    """Service to process brainwave patterns and trigger machine controls"""

    def __init__(self, db: Session):
        self.db = db
        self.machine_controller = MachineController()
        self.last_command_time: Dict[str, datetime] = defaultdict(lambda: _SENTINEL_OLD)
        self.min_command_interval = _MIN_TRIGGER_INTERVAL
        _mode = os.environ.get("MATCH_MODE", "strict").lower()
        self._match_mode = "ordinal" if _mode == "ordinal" else ("approximate" if _mode == "approximate" else "strict")
        self._similarity_threshold = (
            SIMILARITY_APPROXIMATE if self._match_mode == "approximate" else SIMILARITY_STRICT
        )

    async def _execute_accumulated(
        self,
        machine_id: int,
        actions: List[str],
        on_trigger=None,
    ) -> None:
        await _execute_accumulated_impl(self.db, machine_id, actions, on_trigger=on_trigger)

    async def process_band_powers(
        self,
        band_powers: Dict[str, Dict[str, float]],
        user_id: int,
        on_trigger=None,
    ) -> None:
        """
        Process brainwave band powers and trigger machine controls

        Args:
            band_powers: Current band powers from EEG
            user_id: User ID to find their machines
            on_trigger: Optional async callback(machine_id, control_id, value) when a webhook is triggered (e.g. to broadcast to 3D simulator).
        """
        # Get all active machines for this user
        machines = self.machine_controller.get_user_machines(user_id, self.db)
        
        for machine in machines:
            # Get bindings for this machine
            bindings = self.machine_controller.get_machine_bindings(machine.id, user_id, self.db)
            
            control_positions = machine.control_positions or []
            control_configs = {
                control.get("id"): {
                    "webhook_url": control.get("webhook_url"),
                    "value": control.get("value")
                }
                for control in control_positions
                if control.get("id")
            }

            for binding in bindings:
                control_config = control_configs.get(binding.control_id)
                if not control_config:
                    continue
                webhook_url = control_config.get("webhook_url")
                control_value = control_config.get("value")

                if not self._pattern_matches(band_powers, binding.training_session_id, user_id):
                    continue
                control_key = f"{machine.id}_{binding.control_id}"
                now = datetime.now()
                last = _global_last_trigger.get(control_key, _SENTINEL_OLD)
                if (now - last).total_seconds() < self.min_command_interval:
                    continue
                _global_last_trigger[control_key] = now

                if webhook_url:
                    await self._trigger_webhook(
                        machine.id,
                        webhook_url,
                        binding.control_id,
                        control_value,
                        on_trigger=on_trigger,
                    )
                else:
                    acc_key = f"{user_id}_{machine.id}"
                    label = _control_id_to_label(binding.control_id)
                    _ACTION_ACCUMULATOR[acc_key].append(label)
                    if len(_ACTION_ACCUMULATOR[acc_key]) >= ACCUMULATOR_SIZE:
                        actions = list(_ACTION_ACCUMULATOR[acc_key])
                        _ACTION_ACCUMULATOR[acc_key] = []
                        await self._execute_accumulated(
                            machine.id,
                            actions,
                            on_trigger=on_trigger,
                        )

    def _training_session_ids_by_name(self, user_id: int, event_name: str) -> List[int]:
        candidates = _event_name_to_session_name_candidates(EVENT_TO_CONTROL.get(event_name) or event_name)
        if not candidates:
            return []
        norm_candidates = {_session_name_normalize(c) for c in candidates}
        sessions = self.db.query(TrainingSession).filter(
            TrainingSession.user_id == user_id,
            TrainingSession.name.isnot(None),
        ).all()
        return [
            s.id for s in sessions
            if _session_name_normalize(s.name or "") in norm_candidates
        ]

    async def process_event_trigger(
        self,
        event_name: str,
        user_id: int,
        on_trigger=None,
    ) -> None:
        session_ids = self._training_session_ids_by_name(user_id, event_name)
        if not session_ids:
            return
        machines = self.machine_controller.get_user_machines(user_id, self.db)
        for machine in machines:
            bindings = self.machine_controller.get_machine_bindings(machine.id, user_id, self.db)
            control_positions = machine.control_positions or []
            control_configs = {c.get("id"): c for c in control_positions if c.get("id") and c.get("webhook_url")}
            for binding in bindings:
                if binding.training_session_id not in session_ids:
                    continue
                control_config = control_configs.get(binding.control_id)
                if not control_config:
                    continue
                resolved_id = control_config.get("id") or binding.control_id
                control_key = f"{machine.id}_{resolved_id}"
                now = datetime.now()
                last = _global_last_trigger.get(control_key, _SENTINEL_OLD)
                if (now - last).total_seconds() < self.min_command_interval:
                    continue
                _global_last_trigger[control_key] = now
                await self._trigger_webhook(
                    machine.id,
                    control_config.get("webhook_url"),
                    resolved_id,
                    control_config.get("value"),
                    on_trigger=on_trigger,
                )
    
    def _training_signature(self, session: TrainingSession) -> Optional[Dict[str, float]]:
        """Average band powers from session.data['bandPowers'] for this bound control."""
        data = session.data if isinstance(session.data, dict) else {}
        band_list = data.get("bandPowers") or []
        if not band_list:
            return None
        bands = ["Delta", "Theta", "Alpha", "Beta", "Gamma"]
        sums = {b: 0.0 for b in bands}
        count = 0
        for bp in band_list:
            if not isinstance(bp, dict):
                continue
            for b in bands:
                val = bp.get(b) if isinstance(bp.get(b), dict) else None
                if val is not None and "power" in val:
                    sums[b] += float(val["power"])
            count += 1
        if count == 0:
            return None
        return {b: sums[b] / count for b in bands}

    def _current_vector(self, band_powers: Dict) -> Dict[str, float]:
        """Extract current band power vector from live EEG."""
        band_dict = band_powers if isinstance(band_powers, dict) else {}
        bands = ["Delta", "Theta", "Alpha", "Beta", "Gamma"]
        return {
            b: float((band_dict.get(b) or {}).get("power", 0) or 0)
            for b in bands
        }

    def _relative_vector(self, vec: Dict[str, float]) -> Dict[str, float]:
        """Normalize to relative (sum=1) for scale-invariant comparison."""
        total = sum(vec.values()) or 1.0
        return {k: v / total for k, v in vec.items()}

    def _similarity(self, rel_a: Dict[str, float], rel_b: Dict[str, float]) -> float:
        """Cosine similarity of two relative vectors (both non-negative, sum=1)."""
        bands = ["Delta", "Theta", "Alpha", "Beta", "Gamma"]
        dot = sum((rel_a.get(b, 0) * rel_b.get(b, 0) for b in bands))
        return dot

    def _ordinal_matches(self, signature: Dict[str, float], current: Dict[str, float]) -> bool:
        """True if every pairwise order in signature is preserved in current (e.g. theta < beta in both)."""
        bands = ["Delta", "Theta", "Alpha", "Beta", "Gamma"]
        for i, a in enumerate(bands):
            for b in bands[i + 1 :]:
                sa, sb = signature.get(a, 0), signature.get(b, 0)
                ca, cb = current.get(a, 0), current.get(b, 0)
                if sa > sb and not (ca > cb):
                    return False
                if sa < sb and not (ca < cb):
                    return False
        return True

    def _pattern_matches(
        self,
        band_powers: Dict[str, Dict[str, float]],
        training_session_id: int,
        user_id: int
    ) -> bool:
        """
        True if current band powers match this binding's training session pattern.
        Uses average band powers from the session and compares relative (normalized) vectors.
        """
        session = self.db.query(TrainingSession).filter(
            TrainingSession.id == training_session_id,
            TrainingSession.user_id == user_id
        ).first()

        if not session or not session.data:
            return False

        signature = self._training_signature(session)
        if not signature:
            return False

        current = self._current_vector(band_powers)
        total_power = sum(current.values())
        if total_power < 50:
            return False

        if self._match_mode == "ordinal":
            return self._ordinal_matches(signature, current)

        rel_current = self._relative_vector(current)
        rel_signature = self._relative_vector(signature)
        sim = self._similarity(rel_current, rel_signature)
        return sim >= self._similarity_threshold
    
    async def _trigger_webhook(
        self,
        machine_id: int,
        webhook_url: str,
        control_id: str,
        value: Optional[int] = None,
        on_trigger=None,
    ) -> None:
        """Call webhook to execute machine command and log the result."""
        success = False
        status_code = None
        error_message = None
        response_data = None

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(
                    webhook_url,
                    json={
                        "control_id": control_id,
                        "value": value
                    }
                )
                status_code = response.status_code
                
                try:
                    response_data = json.dumps(response.json())
                except:
                    response_data = response.text[:1000]  # Limit to 1000 chars
                
                if response.status_code == 200:
                    result = response.json()
                    success = result.get('success', True)
                    print(f"✓ Webhook triggered: {control_id} -> {webhook_url} (success: {success})")
                else:
                    error_message = f"HTTP {response.status_code}: {response.text[:500]}"
                    key = f"{webhook_url}:{control_id}"
                    now = datetime.now()
                    if now.timestamp() - _last_webhook_error_log.get(key, _SENTINEL_OLD).timestamp() >= WEBHOOK_ERROR_LOG_INTERVAL:
                        _last_webhook_error_log[key] = now
                        print(f"✗ Webhook failed: {control_id} -> {webhook_url} (status: {response.status_code})")
        except Exception as e:
            error_message = str(e)[:1000]
            key = f"{webhook_url}:{control_id}"
            now = datetime.now()
            if now.timestamp() - _last_webhook_error_log.get(key, _SENTINEL_OLD).timestamp() >= WEBHOOK_ERROR_LOG_INTERVAL:
                _last_webhook_error_log[key] = now
                print(f"✗ Webhook error: {control_id} -> {webhook_url} (error: {e})")
        finally:
            # Log the webhook call
            log = MachineLog(
                machine_id=machine_id,
                control_id=control_id,
                webhook_url=webhook_url,
                value=value,
                success=success,
                status_code=status_code,
                error_message=error_message,
                response_data=response_data
            )
            self.db.add(log)
            self.db.commit()
        if on_trigger:
            try:
                await on_trigger(machine_id, control_id, value)
            except Exception:
                pass
