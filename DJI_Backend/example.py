"""
Example usage of DJI Listener

This script demonstrates how to:
1. Connect to a Tello drone
2. Fetch control bindings from the backend
3. Listen for brainwave commands and execute them
"""

import asyncio
import sys
from listener import DJIListener

async def main():
    # Configuration
    TELLO_IP = "192.168.10.1"
    BACKEND_URL = "http://localhost:8000"
    WEBSOCKET_URL = "ws://localhost:8000/ws/eeg"
    MACHINE_ID = 1  # Replace with your machine ID
    TOKEN = None  # Replace with your auth token if needed
    
    print("Starting DJI Listener...")
    print(f"Tello IP: {TELLO_IP}")
    print(f"Machine ID: {MACHINE_ID}")
    print(f"WebSocket: {WEBSOCKET_URL}")
    
    # Create listener
    listener = DJIListener(
        tello_ip=TELLO_IP,
        websocket_url=WEBSOCKET_URL,
        machine_id=MACHINE_ID
    )
    
    # Optional: Set callback for command logging
    def on_command(control_id: str, command: str):
        print(f"[COMMAND] {control_id} -> {command}")
    
    listener.on_command = on_command
    
    try:
        # Fetch bindings from backend
        if TOKEN:
            await listener.fetch_bindings(
                backend_url=BACKEND_URL,
                token=TOKEN
            )
        else:
            print("No token provided, skipping bindings fetch")
            print("You can manually specify control IDs to listen for")
        
        # Start listening
        # Option 1: Listen for specific controls (for testing without bindings)
        # Uncomment to test with specific controls:
        # await listener.start(control_ids=["forward", "back", "takeoff", "land"])
        
        # Option 2: Listen for all bound controls (requires fetch_bindings first)
        if not listener.control_bindings:
            print("\n⚠️  No bindings found. Starting with test controls...")
            print("Controls: forward, back, takeoff, land")
            print("You can trigger commands by thinking/creating brainwave patterns")
            await listener.start(control_ids=["forward", "back", "takeoff", "land"])
        else:
            print(f"\n✓ Found {len(listener.control_bindings)} control bindings")
            await listener.start()
        
    except KeyboardInterrupt:
        print("\nStopping listener...")
        await listener.stop()
    except Exception as e:
        print(f"Error: {e}")
        await listener.stop()
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
