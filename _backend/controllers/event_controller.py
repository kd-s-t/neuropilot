import mne
import numpy as np
from typing import List, Dict, Any
from datetime import datetime
from collections import defaultdict

class EventController:
    def __init__(self):
        self.events: List[Dict[str, Any]] = []
        self.last_logged_event = defaultdict(lambda: datetime.min)
        
        self.BLINK_THRESHOLD = 120
        self.LOOK_RIGHT_THRESHOLD = 100
        self.LOOK_LEFT_THRESHOLD = 100
        self.NOD_THRESHOLD = 90
        self.SHAKE_HEAD_THRESHOLD = 90
        self.SIDESTEP_THRESHOLD = 80

    def is_right_movement(self, data: np.ndarray) -> bool:
        return True

    def is_left_movement(self, data: np.ndarray) -> bool:
        return True

    def is_nod(self, data: np.ndarray) -> bool:
        return True

    def is_shake(self, data: np.ndarray) -> bool:
        return True

    def is_sidestep(self, data: np.ndarray) -> bool:
        return True

    def detect_events(self, segment: np.ndarray):
        try:
            mne.set_log_level("WARNING")
            ch_names = ['EEG']
            ch_types = ['eeg']
            info = mne.create_info(ch_names=ch_names, sfreq=256, ch_types=ch_types)
            raw = mne.io.RawArray(segment, info)
            raw.filter(l_freq=1.0, h_freq=None, fir_design='firwin', filter_length='auto', verbose=False)
            
            data = np.abs(raw.get_data())
            max_amplitude = np.max(data)
            
            if max_amplitude > self.BLINK_THRESHOLD:
                self.log_detected_event("Blink")
            elif max_amplitude > self.LOOK_RIGHT_THRESHOLD and self.is_right_movement(data):
                self.log_detected_event("Look Right")
            elif max_amplitude > self.LOOK_LEFT_THRESHOLD and self.is_left_movement(data):
                self.log_detected_event("Look Left")
            elif max_amplitude > self.NOD_THRESHOLD and self.is_nod(data):
                self.log_detected_event("Nod")
            elif max_amplitude > self.SHAKE_HEAD_THRESHOLD and self.is_shake(data):
                self.log_detected_event("Shake Head")
            elif max_amplitude > self.SIDESTEP_THRESHOLD and self.is_sidestep(data):
                self.log_detected_event("Sidestep")
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
        print(event)
        with open("action_log.txt", "a") as f:
            f.write(f"{current_time}: {action}\n")

    def get_events(self) -> List[Dict[str, Any]]:
        return self.events

    def get_logs(self) -> List[str]:
        try:
            with open("action_log.txt", "r") as f:
                logs = f.readlines()
            return [log.strip() for log in logs]
        except FileNotFoundError:
            return []
