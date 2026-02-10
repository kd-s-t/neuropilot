"""
Test DJI Tello commands manually
Use this to verify connection and test commands before using brainwave control
"""

import asyncio
import sys
from connection import DJIConnection
from commands import DJICommands

async def test_connection():
    """Test basic connection to Tello"""
    print("Testing Tello connection...")
    conn = DJIConnection()
    
    if conn.connect():
        print("✓ Connected to Tello!")
        return conn
    else:
        print("✗ Failed to connect to Tello")
        return None

async def test_commands(conn: DJIConnection):
    """Test various commands"""
    if not conn:
        return
    
    print("\n=== Testing Commands ===")
    
    commands_to_test = [
        ("takeoff", None),
        ("forward", 20),
        ("back", 20),
        ("left", 20),
        ("right", 20),
        ("up", 20),
        ("down", 20),
        ("cw", 90),
        ("ccw", 90),
        ("land", None),
    ]
    
    print("\nAvailable commands:")
    for i, (cmd, val) in enumerate(commands_to_test, 1):
        val_str = f" {val}" if val else ""
        print(f"  {i}. {cmd}{val_str}")
    
    print("\nEnter command number to test (or 'q' to quit):")
    
    while True:
        try:
            choice = input("> ").strip().lower()
            
            if choice == 'q':
                break
            
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(commands_to_test):
                    cmd, val = commands_to_test[idx]
                    tello_cmd = DJICommands.get_command(cmd, val) or cmd
                    
                    print(f"\nSending: {tello_cmd}")
                    loop = asyncio.get_event_loop()
                    response = await loop.run_in_executor(
                        None,
                        conn.send_command,
                        tello_cmd
                    )
                    print(f"Response: {response}")
                else:
                    print("Invalid choice")
            except ValueError:
                print("Invalid input")
        
        except KeyboardInterrupt:
            break
        except EOFError:
            break

async def main():
    print("DJI Tello Command Tester")
    print("=" * 40)
    print("Make sure you're connected to Tello's WiFi network!")
    print()
    
    conn = await test_connection()
    
    if conn:
        await test_commands(conn)
        conn.disconnect()
        print("\nDisconnected from Tello")
    else:
        print("\nCannot proceed without connection")
        sys.exit(1)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nExiting...")
