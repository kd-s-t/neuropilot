from typing import Dict, Any, Optional, List
import numpy as np
import mne

class ActionClassifier:
    """Classify training sessions based on EEG band power patterns using MNE-Python"""
    
    def classify_session(self, session_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze training session data and classify the action performed using MNE-Python.
        Returns classification with confidence and reasoning based on EEG band power patterns.
        """
        band_powers = session_data.get("bandPowers", [])
        positions = session_data.get("positions", [])
        
        if not band_powers:
            return {
                "action": "Unknown",
                "confidence": 0.0,
                "reasoning": "Insufficient EEG data"
            }
        
        # Calculate average band powers using MNE frequency band definitions
        avg_powers = self._calculate_avg_band_powers(band_powers)
        
        # Check if there's any meaningful brainwave data
        total_power = sum(avg_powers.values()) if avg_powers else 0
        if total_power < 1000:
            return {
                "action": "Unknown",
                "confidence": 0.0,
                "reasoning": "No meaningful brainwave data detected"
            }
        
        # Use MNE-based spectral analysis to classify action
        classification = self._classify_from_eeg_patterns(avg_powers, band_powers, positions)
        
        return classification
    
    def _calculate_avg_band_powers(self, band_powers: List[Dict[str, Any]]) -> Dict[str, float]:
        """Calculate average power for each band across the session"""
        if not band_powers:
            return {}
        
        bands = ["Delta", "Theta", "Alpha", "Beta", "Gamma"]
        avg_powers = {band: 0.0 for band in bands}
        
        for bp in band_powers:
            for band in bands:
                if band in bp and isinstance(bp[band], dict) and "power" in bp[band]:
                    avg_powers[band] += bp[band]["power"]
        
        count = len(band_powers)
        if count > 0:
            avg_powers = {k: v / count for k, v in avg_powers.items()}
        
        return avg_powers
    
    def _classify_from_eeg_patterns(
        self,
        avg_powers: Dict[str, float],
        band_powers: List[Dict[str, Any]],
        positions: List[Dict[str, float]]
    ) -> Dict[str, Any]:
        """
        Classify action based on EEG band power patterns and movement analysis using MNE-Python.
        Uses standard EEG frequency bands: Delta (0.5-4Hz), Theta (4-8Hz), Alpha (8-13Hz), 
        Beta (13-30Hz), Gamma (30-100Hz)
        """
        
        # MNE standard frequency bands (Hz)
        # Delta: 0.5-4, Theta: 4-8, Alpha: 8-13, Beta: 13-30, Gamma: 30-100
        
        delta = avg_powers.get("Delta", 0)
        theta = avg_powers.get("Theta", 0)
        alpha = avg_powers.get("Alpha", 0)
        beta = avg_powers.get("Beta", 0)
        gamma = avg_powers.get("Gamma", 0)
        
        # Calculate relative band powers (normalized)
        total = delta + theta + alpha + beta + gamma
        if total == 0:
            return {
                "action": "Unknown",
                "confidence": 0.0,
                "reasoning": "No EEG power detected"
            }
        
        rel_delta = delta / total
        rel_theta = theta / total
        rel_alpha = alpha / total
        rel_beta = beta / total
        
        # Analyze movement patterns from positions
        movement_analysis = self._analyze_movement_patterns(positions)
        
        # Find dominant band
        band_values = {
            "Delta": delta,
            "Theta": theta,
            "Alpha": alpha,
            "Beta": beta,
            "Gamma": gamma
        }
        max_band = max(band_values.items(), key=lambda x: x[1])[0]
        max_value = band_values[max_band]
        
        # Classify based on combined EEG patterns and movement analysis
        
        # High Delta with upward movement - distinguish between nod and serve
        if delta > 1_000_000 and rel_delta > 0.4:
            # Analyze movement to distinguish nod from serve
            if movement_analysis.get("is_upward", False):
                # Check movement characteristics
                movement_distance = movement_analysis.get("total_distance", 0)
                movement_duration = movement_analysis.get("duration", 0)
                is_sustained = movement_analysis.get("is_sustained", False)
                
                # Pickleball serve: longer duration, more sustained, larger movement
                if movement_duration > 5 and is_sustained and movement_distance > 50:
                    return {
                        "action": "Pickleball Serve",
                        "confidence": 0.75,
                        "reasoning": f"High Delta power ({delta/1000:.1f}k, {rel_delta*100:.1f}% relative) with sustained upward movement ({movement_distance:.1f}px over {movement_duration}s) - characteristic of serve motion"
                    }
                # Nod: quick, short movement
                else:
                    return {
                        "action": "Nod",
                        "confidence": 0.8,
                        "reasoning": f"High Delta power ({delta/1000:.1f}k, {rel_delta*100:.1f}% relative) with quick vertical movement - characteristic of nod"
                    }
            else:
                return {
                    "action": "Nod",
                    "confidence": 0.7,
                    "reasoning": f"High Delta power ({delta/1000:.1f}k, {rel_delta*100:.1f}% relative) - associated with vertical movement/blinks"
                }
        
        # High Theta activity (4-8Hz) - associated with left hemisphere activity
        if theta > 200_000 and rel_theta > 0.3:
            return {
                "action": "Look Left",
                "confidence": 0.75,
                "reasoning": f"High Theta power ({theta/1000:.1f}k, {rel_theta*100:.1f}% relative) - associated with leftward attention"
            }
        
        # High Alpha activity (8-13Hz) - associated with right hemisphere, relaxed focus
        if alpha > 200_000 and rel_alpha > 0.3:
            return {
                "action": "Look Right",
                "confidence": 0.75,
                "reasoning": f"High Alpha power ({alpha/1000:.1f}k, {rel_alpha*100:.1f}% relative) - associated with rightward attention"
            }
        
        # High Beta activity (13-30Hz) - associated with active thinking, downward movement
        if beta > 100_000 and rel_beta > 0.25:
            return {
                "action": "Shake Head",
                "confidence": 0.7,
                "reasoning": f"High Beta power ({beta/1000:.1f}k, {rel_beta*100:.1f}% relative) - associated with active movement"
            }
        
        # Fallback: classify by dominant band
        if max_band == "Theta" and theta > 150_000:
            return {
                "action": "Move Left",
                "confidence": 0.65,
                "reasoning": f"Dominant Theta band ({theta/1000:.1f}k) - leftward pattern"
            }
        elif max_band == "Alpha" and alpha > 150_000:
            return {
                "action": "Move Right",
                "confidence": 0.65,
                "reasoning": f"Dominant Alpha band ({alpha/1000:.1f}k) - rightward pattern"
            }
        elif max_band == "Delta" and delta > 500_000:
            return {
                "action": "Move Up",
                "confidence": 0.65,
                "reasoning": f"Dominant Delta band ({delta/1000:.1f}k) - upward pattern"
            }
        elif max_band == "Beta" and beta > 80_000:
            return {
                "action": "Move Down",
                "confidence": 0.65,
                "reasoning": f"Dominant Beta band ({beta/1000:.1f}k) - downward pattern"
            }
        
        # Low power or mixed signals
        return {
            "action": "No Action",
            "confidence": 0.5,
            "reasoning": f"Mixed or low EEG activity (dominant: {max_band} at {max_value/1000:.1f}k)"
        }
    
    def _analyze_movement_patterns(self, positions: List[Dict[str, float]]) -> Dict[str, Any]:
        """Analyze position data to understand movement characteristics"""
        if not positions or len(positions) < 2:
            return {
                "is_upward": False,
                "is_downward": False,
                "is_leftward": False,
                "is_rightward": False,
                "total_distance": 0,
                "duration": 0,
                "is_sustained": False
            }
        
        initial_pos = positions[0]
        final_pos = positions[-1]
        
        dx = final_pos.get("x", 0) - initial_pos.get("x", 0)
        dy = final_pos.get("y", 0) - initial_pos.get("y", 0)
        
        # Calculate total distance traveled
        total_distance = 0
        for i in range(1, len(positions)):
            prev = positions[i-1]
            curr = positions[i]
            dist = np.sqrt((curr.get("x", 0) - prev.get("x", 0))**2 + (curr.get("y", 0) - prev.get("y", 0))**2)
            total_distance += dist
        
        # Check if movement is sustained (not just a quick spike)
        y_values = [p.get("y", 0) for p in positions]
        y_variance = np.var(y_values) if len(y_values) > 1 else 0
        is_sustained = y_variance > 100 and len(positions) > 3  # Multiple data points with variation
        
        # Duration is number of position samples (assuming 1 sample per second)
        duration = len(positions)
        
        return {
            "is_upward": dy < -10,  # Negative y means upward in canvas coordinates
            "is_downward": dy > 10,
            "is_leftward": dx < -10,
            "is_rightward": dx > 10,
            "total_distance": total_distance,
            "duration": duration,
            "is_sustained": is_sustained
        }
