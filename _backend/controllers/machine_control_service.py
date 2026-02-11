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
import httpx
import asyncio
import json
from typing import Dict, List, Optional
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
            
            # Get control positions to find webhook URLs and values
            control_positions = machine.control_positions or []
            control_configs = {
                control.get("id"): {
                    "webhook_url": control.get("webhook_url"),
                    "value": control.get("value")
                }
                for control in control_positions
                if control.get("id") and control.get("webhook_url")
            }
            
            for binding in bindings:
                # Get webhook config for this specific control
                control_config = control_configs.get(binding.control_id)
                if not control_config or not control_config.get("webhook_url"):
                    continue  # Skip if no webhook URL for this control
                
                webhook_url = control_config.get("webhook_url")
                control_value = control_config.get("value")
                
                # Check if pattern matches this binding's training session
                if self._pattern_matches(band_powers, binding.training_session_id, user_id):
                    control_key = f"{machine.id}_{binding.control_id}"
                    now = datetime.now()
                    last = _global_last_trigger.get(control_key, _SENTINEL_OLD)
                    if (now - last).total_seconds() >= self.min_command_interval:
                        _global_last_trigger[control_key] = now
                        await self._trigger_webhook(
                            machine.id,
                            webhook_url,
                            binding.control_id,
                            control_value,
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
