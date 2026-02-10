import asyncio
import websockets
import json
import time
from typing import Optional, Dict, Callable, List
from datetime import datetime
from connection import DJIConnection
from commands import DJICommands

class DJIListener:
    """Listens for brainwave commands and sends them to DJI Tello"""
    
    def __init__(
        self,
        tello_ip: str = "192.168.10.1",
        tello_port: int = 8889,
        websocket_url: str = "ws://localhost:8000/ws/eeg",
        machine_id: Optional[int] = None
    ):
        self.connection = DJIConnection(tello_ip, tello_port)
        self.websocket_url = websocket_url
        self.machine_id = machine_id
        self.running = False
        self.websocket: Optional[websockets.WebSocketClientProtocol] = None
        
        # Control bindings: maps control_id to training session patterns
        self.control_bindings: Dict[str, Dict] = {}
        
        # Last command time to prevent spam
        self.last_command_time: Dict[str, float] = {}
        self.min_command_interval = 0.5  # seconds between same command
        
        # Command callback for logging
        self.on_command: Optional[Callable[[str, str], None]] = None
    
    async def fetch_bindings(self, backend_url: str = "http://localhost:8000", token: Optional[str] = None):
        """Fetch control bindings from backend API"""
        if not self.machine_id:
            print("No machine_id set, skipping bindings fetch")
            return
        
        try:
            import aiohttp
            url = f"{backend_url}/machines/{self.machine_id}/bindings"
            headers = {}
            if token:
                headers["Authorization"] = f"Bearer {token}"
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers) as response:
                    if response.status == 200:
                        bindings = await response.json()
                        print(f"Fetched {len(bindings)} bindings for machine {self.machine_id}")
                        # Store bindings for later use
                        for binding in bindings:
                            control_id = binding.get("control_id")
                            if control_id:
                                self.control_bindings[control_id] = binding
                    else:
                        print(f"Failed to fetch bindings: {response.status}")
        except Exception as e:
            print(f"Error fetching bindings: {e}")
    
    def should_execute_command(self, control_id: str) -> bool:
        """Check if enough time has passed since last command"""
        now = time.time()
        last_time = self.last_command_time.get(control_id, 0)
        if now - last_time < self.min_command_interval:
            return False
        self.last_command_time[control_id] = now
        return True
    
    def process_band_powers(self, band_powers: Dict, control_id: str) -> bool:
        """
        Process band powers to determine if control should be triggered
        
        Compares current brainwave patterns against training session data
        """
        # Extract current band powers
        alpha = band_powers.get("Alpha", {}).get("power", 0)
        beta = band_powers.get("Beta", {}).get("power", 0)
        delta = band_powers.get("Delta", {}).get("power", 0)
        theta = band_powers.get("Theta", {}).get("power", 0)
        gamma = band_powers.get("Gamma", {}).get("power", 0)
        
        # Calculate total power
        total_power = alpha + beta + delta + theta + gamma
        
        if total_power < 1000:  # Too low, likely noise
            return False
        
        # Get binding for this control (if available)
        binding = self.control_bindings.get(control_id)
        
        if binding:
            # TODO: Compare against actual training session data from binding
            # For now, use pattern matching based on control type
            pass
        
        # Simple threshold-based detection for testing
        # Adjust these thresholds based on your brainwave patterns
        
        # Relative band powers
        rel_alpha = alpha / total_power if total_power > 0 else 0
        rel_beta = beta / total_power if total_power > 0 else 0
        rel_delta = delta / total_power if total_power > 0 else 0
        
        # Trigger conditions (adjust these based on your training data)
        # High alpha + beta typically indicates focused thought
        if rel_alpha > 0.3 and rel_beta > 0.25:
            return True
        
        # High delta can indicate intentional movement
        if delta > 50000 and rel_alpha > 0.2:
            return True
        
        # Very high total power (strong signal)
        if total_power > 200000:
            return True
        
        return False
    
    async def connect_to_tello(self) -> bool:
        """Connect to Tello drone"""
        # Run in thread since connect() is blocking
        loop = asyncio.get_event_loop()
        connected = await loop.run_in_executor(None, self.connection.connect)
        return connected
    
    async def connect_to_websocket(self):
        """Connect to EEG WebSocket"""
        try:
            self.websocket = await websockets.connect(self.websocket_url)
            print(f"Connected to WebSocket: {self.websocket_url}")
        except Exception as e:
            print(f"Error connecting to WebSocket: {e}")
            raise
    
    async def listen_for_commands(self, control_id: str):
        """
        Listen for EEG data and execute commands when patterns match
        
        Args:
            control_id: The control ID to listen for (e.g., "forward", "takeoff")
        """
        if not self.websocket:
            await self.connect_to_websocket()
        
        print(f"✓ Listening for commands for control: {control_id}")
        print(f"  Waiting for brainwave patterns... (press Ctrl+C to stop)")
        
        try:
            async for message in self.websocket:
                try:
                    data = json.loads(message)
                    
                    # Check if this pattern matches the control
                    if self.process_band_powers(data, control_id):
                        if self.should_execute_command(control_id):
                            command = DJICommands.get_command(control_id)
                            if command:
                                # Execute command
                                loop = asyncio.get_event_loop()
                                response = await loop.run_in_executor(
                                    None,
                                    self.connection.send_command,
                                    command
                                )
                                
                                if self.on_command:
                                    self.on_command(control_id, command)
                                
                                print(f"\n🎯 TRIGGERED: {control_id} -> {command}")
                                print(f"   Response: {response}")
                                print(f"   Continuing to listen...\n")
                
                except json.JSONDecodeError:
                    continue
                except Exception as e:
                    print(f"Error processing message: {e}")
        
        except websockets.exceptions.ConnectionClosed:
            print("WebSocket connection closed")
        except Exception as e:
            print(f"Error in listen_for_commands: {e}")
    
    async def start(self, control_ids: Optional[List[str]] = None):
        """Start listening for commands"""
        if self.running:
            print("Listener already running")
            return
        
        # Connect to Tello
        if not await self.connect_to_tello():
            print("Failed to connect to Tello")
            return
        
        # Connect to WebSocket
        await self.connect_to_websocket()
        
        self.running = True
        
        # If control_ids provided, listen for those specific controls
        if control_ids:
            tasks = [self.listen_for_commands(control_id) for control_id in control_ids]
            await asyncio.gather(*tasks)
        else:
            # Listen for all bound controls
            if self.control_bindings:
                tasks = [self.listen_for_commands(control_id) for control_id in self.control_bindings.keys()]
                await asyncio.gather(*tasks)
            else:
                print("No control bindings found. Use fetch_bindings() first or provide control_ids.")
    
    async def stop(self):
        """Stop listening and disconnect"""
        self.running = False
        if self.websocket:
            await self.websocket.close()
        self.connection.disconnect()
        print("DJI Listener stopped")
    
    def send_manual_command(self, control_id: str, value: Optional[int] = None) -> Optional[str]:
        """Manually send a command (for testing)"""
        command = DJICommands.get_command(control_id, value)
        if command:
            loop = asyncio.get_event_loop()
            response = loop.run_until_complete(
                loop.run_in_executor(None, self.connection.send_command, command)
            )
            return response
        return None
