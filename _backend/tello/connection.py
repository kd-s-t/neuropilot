import socket
import threading
import time
from typing import Optional, Callable

class DJIConnection:
    def __init__(self, tello_ip: str = "192.168.10.1", tello_port: int = 8889):
        self.tello_ip = tello_ip
        self.tello_port = tello_port
        self.socket: Optional[socket.socket] = None
        self.connected = False
        self.response_received = False
        self.response_data = ""

    def connect(self) -> bool:
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.socket.bind(('', 8889))
            self.socket.settimeout(10.0)
            response = self.send_command("command")
            if response and "ok" in response.lower():
                self.connected = True
                return True
            return False
        except Exception:
            return False

    def send_command(self, command: str, timeout: float = 10.0) -> Optional[str]:
        if not self.socket:
            return None
        try:
            self.response_received = False
            self.response_data = ""
            self.socket.sendto(command.encode('utf-8'), (self.tello_ip, self.tello_port))
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
            return None
        except Exception:
            return None

    def send_command_async(self, command: str) -> None:
        if not self.socket:
            return
        try:
            self.socket.sendto(command.encode('utf-8'), (self.tello_ip, self.tello_port))
        except Exception:
            pass

    def disconnect(self):
        if self.socket:
            self.socket.close()
            self.socket = None
        self.connected = False
