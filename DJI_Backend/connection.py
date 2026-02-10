import socket
import threading
import time
from typing import Optional, Callable

class DJIConnection:
    """UDP connection handler for DJI Tello drone"""
    
    def __init__(self, tello_ip: str = "192.168.10.1", tello_port: int = 8889):
        self.tello_ip = tello_ip
        self.tello_port = tello_port
        self.socket: Optional[socket.socket] = None
        self.connected = False
        self.response_received = False
        self.response_data = ""
        
    def connect(self) -> bool:
        """Initialize UDP socket and enable SDK mode"""
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.socket.bind(('', 8889))
            self.socket.settimeout(10.0)
            
            # Enable SDK mode
            response = self.send_command("command")
            if response and "ok" in response.lower():
                self.connected = True
                print(f"Connected to Tello at {self.tello_ip}:{self.tello_port}")
                return True
            else:
                print(f"Failed to enable SDK mode. Response: {response}")
                return False
        except Exception as e:
            print(f"Error connecting to Tello: {e}")
            return False
    
    def send_command(self, command: str, timeout: float = 10.0) -> Optional[str]:
        """Send command to Tello and wait for response"""
        if not self.socket:
            print("Socket not initialized. Call connect() first.")
            return None
        
        try:
            self.response_received = False
            self.response_data = ""
            
            # Send command
            self.socket.sendto(command.encode('utf-8'), (self.tello_ip, self.tello_port))
            
            # Wait for response
            start_time = time.time()
            while not self.response_received and (time.time() - start_time) < timeout:
                try:
                    response, addr = self.socket.recvfrom(1024)
                    self.response_data = response.decode('utf-8', errors='replace').strip()
                    self.response_received = True
                    break
                except socket.timeout:
                    continue
            
            if self.response_received:
                return self.response_data
            else:
                print(f"No response received for command: {command}")
                return None
                
        except Exception as e:
            print(f"Error sending command '{command}': {e}")
            return None
    
    def send_command_async(self, command: str) -> None:
        """Send command without waiting for response"""
        if not self.socket:
            print("Socket not initialized. Call connect() first.")
            return
        
        try:
            self.socket.sendto(command.encode('utf-8'), (self.tello_ip, self.tello_port))
        except Exception as e:
            print(f"Error sending async command '{command}': {e}")
    
    def disconnect(self):
        """Close connection"""
        if self.socket:
            self.socket.close()
            self.socket = None
        self.connected = False
        print("Disconnected from Tello")
