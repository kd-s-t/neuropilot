import json
import os
import mne
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from collections import defaultdict

try:
    from mne.preprocessing import find_eog_events
except ImportError:
    find_eog_events = None

BANDS = ["Delta", "Theta", "Alpha", "Beta", "Gamma"]
_SAVED_DIR = os.path.join(os.path.dirname(__file__), "..", "saved_models")
_EVENT_MODEL_PATH = os.path.join(_SAVED_DIR, "event_model.pkl")
_EVENT_LABELS_PATH = os.path.join(_SAVED_DIR, "event_model_labels.json")
_MIN_CONFIDENCE = 0.5

class EventController:
    def __init__(self):
        self.events: List[Dict[str, Any]] = []
        self.last_logged_event = defaultdict(lambda: datetime.min)
        self._last_event: Optional[str] = None
        self._sfreq = 256
        self._eog_ch = "EEG"
        self._event_model = None
        self._event_labels: List[str] = []

    def _load_event_model(self) -> bool:
        if self._event_model is not None:
            return True
        if not os.path.isfile(_EVENT_MODEL_PATH) or not os.path.isfile(_EVENT_LABELS_PATH):
            return False
        try:
            import pickle
            with open(_EVENT_MODEL_PATH, "rb") as f:
                self._event_model = pickle.load(f)
            with open(_EVENT_LABELS_PATH, "r") as f:
                self._event_labels = json.load(f)
            return True
        except Exception:
            return False

    def predict_from_band_powers(self, band_powers: Dict[str, Any]) -> Tuple[Optional[str], float]:
        if not band_powers or not self._load_event_model():
            return None, 0.0
        vec = []
        for b in BANDS:
            v = band_powers.get(b)
            p = float((v.get("power", 0) or 0)) if isinstance(v, dict) else 0.0
            vec.append(p)
        if len(vec) != 5:
            return None, 0.0
        try:
            proba = self._event_model.predict_proba([vec])[0]
            idx = int(np.argmax(proba))
            conf = float(proba[idx])
            if conf < _MIN_CONFIDENCE or idx >= len(self._event_labels):
                return None, 0.0
            return self._event_labels[idx], conf
        except Exception:
            return None, 0.0

    def detect_events(self, segment: np.ndarray):
        try:
            mne.set_log_level("WARNING")
            if segment.size == 0:
                return
            data = np.asarray(segment, dtype=np.float64)
            if data.ndim == 1:
                data = data.reshape(1, -1)
            ch_names = [self._eog_ch]
            ch_types = ["eeg"]
            info = mne.create_info(ch_names=ch_names, sfreq=self._sfreq, ch_types=ch_types)
            raw = mne.io.RawArray(data, info, verbose=False)
            if find_eog_events is None:
                return
            eog_events = find_eog_events(
                raw,
                ch_name=self._eog_ch,
                l_freq=1.0,
                h_freq=10.0,
                verbose=False,
            )
            if eog_events is not None and len(eog_events) > 0:
                self.log_detected_event("Blink")
        except Exception as e:
            print(f"Error in event detection: {e}")

    def log_detected_event(self, action: str):
        current_time = datetime.now()
        time_since_last_log = (current_time - self.last_logged_event[action]).total_seconds()
        if time_since_last_log < 1:
            return
        
        self.last_logged_event[action] = current_time
        
        event = {
            "timestamp": current_time.isoformat(),
            "event": action
        }
        self.events.append(event)
        self._last_event = action
        print(event)
        with open("action_log.txt", "a") as f:
            f.write(f"{current_time}: {action}\n")

    def get_and_clear_last_event(self) -> Optional[str]:
        out = self._last_event
        self._last_event = None
        return out

    def get_events(self) -> List[Dict[str, Any]]:
        return self.events

    def get_logs(self) -> List[str]:
        try:
            with open("action_log.txt", "r") as f:
                logs = f.readlines()
            return [log.strip() for log in logs]
        except FileNotFoundError:
            return []
