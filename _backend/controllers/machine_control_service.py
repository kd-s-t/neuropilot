"""
Machine Control Service
Detects brainwave patterns and triggers machine controls via webhooks
"""

import httpx
import asyncio
import json
from typing import Dict, List, Optional
from datetime import datetime
from collections import defaultdict
from sqlalchemy.orm import Session
from models import Machine, MachineControlBinding, TrainingSession, MachineLog
from controllers import MachineController

class MachineControlService:
    """Service to process brainwave patterns and trigger machine controls"""
    
    def __init__(self, db: Session):
        self.db = db
        self.machine_controller = MachineController()
        self.last_command_time: Dict[str, datetime] = defaultdict(lambda: datetime.min)
        self.min_command_interval = 0.5  # seconds between same command
        
    async def process_band_powers(
        self, 
        band_powers: Dict[str, Dict[str, float]], 
        user_id: int
    ) -> None:
        """
        Process brainwave band powers and trigger machine controls
        
        Args:
            band_powers: Current band powers from EEG
            user_id: User ID to find their machines
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
                    # Check rate limiting
                    control_key = f"{machine.id}_{binding.control_id}"
                    now = datetime.now()
                    time_since_last = (now - self.last_command_time[control_key]).total_seconds()
                    
                    if time_since_last >= self.min_command_interval:
                        self.last_command_time[control_key] = now
                        # Trigger webhook for this specific control with value
                        await self._trigger_webhook(
                            machine.id,
                            webhook_url,
                            binding.control_id,
                            control_value
                        )
    
    def _pattern_matches(
        self, 
        band_powers: Dict[str, Dict[str, float]], 
        training_session_id: int,
        user_id: int
    ) -> bool:
        """
        Check if current band powers match training session pattern
        
        TODO: Implement actual pattern matching against training session data
        For now, uses simple threshold-based detection
        """
        # Get training session data
        session = self.db.query(TrainingSession).filter(
            TrainingSession.id == training_session_id,
            TrainingSession.user_id == user_id
        ).first()
        
        if not session or not session.data:
            return False
        
        # Extract current band powers
        alpha = band_powers.get("Alpha", {}).get("power", 0)
        beta = band_powers.get("Beta", {}).get("power", 0)
        delta = band_powers.get("Delta", {}).get("power", 0)
        theta = band_powers.get("Theta", {}).get("power", 0)
        gamma = band_powers.get("Gamma", {}).get("power", 0)
        
        total_power = alpha + beta + delta + theta + gamma
        
        if total_power < 1000:
            return False
        
        # Simple threshold-based matching
        # TODO: Compare against actual training session band power patterns
        rel_alpha = alpha / total_power if total_power > 0 else 0
        rel_beta = beta / total_power if total_power > 0 else 0
        
        # Trigger if high alpha + beta (focused thought)
        if rel_alpha > 0.3 and rel_beta > 0.25:
            return True
        
        # Trigger if very high total power
        if total_power > 200000:
            return True
        
        return False
    
    async def _trigger_webhook(self, machine_id: int, webhook_url: str, control_id: str, value: Optional[int] = None) -> None:
        """Call webhook to execute machine command and log the result"""
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
                    print(f"✗ Webhook failed: {control_id} -> {webhook_url} (status: {response.status_code})")
        except Exception as e:
            error_message = str(e)[:1000]  # Limit to 1000 chars
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
