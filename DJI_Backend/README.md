# DJI Tello Integration

This module provides integration with DJI Tello drones for brainwave-controlled flight using a **webhook architecture**.

## Architecture

```
FastAPI (detects patterns) → HTTP POST → DJI Webhook Server → Tello Commands
```

**How it works:**
1. FastAPI processes brainwave data in real-time
2. When pattern matches a control binding → FastAPI calls webhook
3. DJI webhook server receives command → Executes on Tello

## Quick Start

### Prerequisites

1. **Python 3.7+** (required - use `python3`, not `python`)
2. **FastAPI backend running** at `http://localhost:8000`
3. **Tello drone** powered on and in WiFi mode
4. **Connected to Tello's WiFi network** (default: `TELLO-XXXXXX`)

### Installation

```bash
cd DJI_Backend
python3 -m pip install -r requirements.txt
```

### Start Webhook Server

```bash
cd DJI_Backend
chmod +x start_webhook.sh
./start_webhook.sh
# Or: python3 webhook_server.py
```

The webhook server runs on `http://localhost:8888` and listens for commands from FastAPI.

## Setup Steps

### 1. Connect to Tello WiFi

1. Power on your Tello drone
2. On your computer, connect to the WiFi network named `TELLO-XXXXXX`
3. Wait for connection (may take 10-30 seconds)
4. Verify connection: `ping 192.168.10.1`

### 2. Configure the Listener

Edit `example.py` and set:

```python
TELLO_IP = "192.168.10.1"  # Default Tello IP
MACHINE_ID = 1  # Your machine ID from the web UI
TOKEN = "your_auth_token"  # Optional, for fetching bindings
```

### 3. Create Machine in Web UI

1. Open `http://localhost:3000` in your browser
2. Go to Machines page
3. Create a new machine with type `dji` or `tello`
4. Note the machine ID (shown in URL: `/machines/{id}`)
5. Click "Manage Controls" and add controls (forward, back, left, right, takeoff, land, etc.)
6. **Set Webhook URL**: For each control, set the webhook URL to `http://localhost:8888/command`
7. Bind training sessions to controls

### 4. Start the Webhook Server

```bash
cd DJI_Backend
chmod +x start_webhook.sh
./start_webhook.sh
```

The webhook server will:
- Attempt to connect to Tello drone via UDP (if available)
- Listen for HTTP POST requests on `http://localhost:8888/command`
- Receive commands from FastAPI when brainwave patterns match
- Execute Tello commands (takeoff, land, forward, etc.)
- Accept commands even if Tello is not connected (returns 200 OK)

## File Structure

- `connection.py` - UDP connection handler for Tello communication
- `commands.py` - Maps control IDs to Tello commands
- `listener.py` - Main listener that processes brainwave data and executes commands
- `webhook_server.py` - FastAPI webhook server that receives commands from FastAPI backend
- `example.py` - Example usage script
- `start.sh` - Startup script with Python 3 checks
- `start_webhook.sh` - Startup script for webhook server
- `test_commands.py` - Interactive script to test Tello commands
- `requirements.txt` - Python dependencies

## Usage Examples

### Basic Connection Test

```python
from connection import DJIConnection

# Connect to Tello
conn = DJIConnection()
if conn.connect():
    # Send commands
    response = conn.send_command("takeoff")
    print(response)  # "ok"
    
    conn.send_command("forward 20")
    conn.send_command("land")
    conn.disconnect()
```

### Listening for Brainwave Commands

```python
import asyncio
from listener import DJIListener

async def main():
    listener = DJIListener(
        tello_ip="192.168.10.1",
        machine_id=1,  # Your machine ID
        websocket_url="ws://localhost:8000/ws/eeg"
    )
    
    # Fetch control bindings from backend
    await listener.fetch_bindings(
        backend_url="http://localhost:8000",
        token="your_token_here"
    )
    
    # Start listening for all bound controls
    await listener.start()

asyncio.run(main())
```

### Manual Command Execution

```python
import asyncio
from listener import DJIListener

async def main():
    listener = DJIListener()
    await listener.connect_to_tello()
    
    # Send manual command
    response = listener.send_manual_command("forward", value=30)
    print(response)  # "ok"
    
    await listener.stop()

asyncio.run(main())
```

## Command Mappings

Control IDs are automatically mapped to Tello commands (see `commands.py`):

| Control ID | Tello Command | Description |
|-----------|---------------|-------------|
| `forward` | `forward 20` | Move forward 20cm |
| `back` | `back 20` | Move backward 20cm |
| `left` | `left 20` | Move left 20cm |
| `right` | `right 20` | Move right 20cm |
| `up` | `up 20` | Move up 20cm |
| `down` | `down 20` | Move down 20cm |
| `takeoff` | `takeoff` | Take off and hover |
| `land` | `land` | Land gradually |
| `start` | `takeoff` | Alias for takeoff |
| `stop` | `land` | Alias for land |
| `rotate_cw` | `cw 90` | Rotate clockwise 90° |
| `rotate_ccw` | `ccw 90` | Rotate counter-clockwise 90° |
| `flip_left` | `flip l` | Flip left |
| `flip_right` | `flip r` | Flip right |
| `flip_forward` | `flip f` | Flip forward |
| `flip_back` | `flip b` | Flip backward |
| `emergency` | `emergency` | Stop all motors immediately |
| `streamon` | `streamon` | Enable video stream |
| `streamoff` | `streamoff` | Disable video stream |

You can customize distances/angles by passing a `value` parameter for movement and rotation commands.

## Requirements

- **Python 3.7+** (use `python3` command)
- `websockets>=10.0` - For WebSocket client
- `aiohttp>=3.8.0` - For HTTP requests to fetch bindings

Install with:
```bash
python3 -m pip install -r requirements.txt
```

## Network Configuration

- **Tello IP**: `192.168.10.1` (default)
- **Tello Port**: `8889` (UDP)
- **WiFi Network**: `TELLO-XXXXXX` (shown on Tello LED)

### Troubleshooting Network Issues

1. **Can't connect to Tello WiFi**
   - Make sure Tello is powered on
   - Check WiFi network name matches `TELLO-XXXXXX`
   - Try forgetting and reconnecting to the network

2. **Connection timeout**
   - Verify IP: `ping 192.168.10.1`
   - Check firewall isn't blocking UDP port 8889
   - Try restarting Tello

3. **No response from commands**
   - Ensure Tello is in SDK mode (first command should be `command`)
   - Check battery level
   - Verify you're connected to Tello's WiFi, not your regular network

## Integration with Neuro-Pilot

The webhook server integrates with your Neuro-Pilot system:

1. **Webhook Architecture**: FastAPI detects brainwave patterns and pushes commands via HTTP POST
2. **Per-Control Webhooks**: Each control can have its own webhook URL set in the web UI
3. **Pattern Matching**: FastAPI matches brainwave patterns against training session data
4. **Command Execution**: When patterns match, FastAPI calls the control's webhook URL
5. **Tello Control**: Webhook server receives command and executes on Tello via UDP

### Workflow

1. User trains brainwave patterns in Training mode
2. User creates a machine and adds controls (forward, left, right, etc.)
3. User sets webhook URL for each control (e.g., `http://localhost:8888/command`)
4. User binds training sessions to controls
5. FastAPI processes real-time EEG data
6. When brainwave pattern matches a bound control, FastAPI calls the control's webhook
7. Webhook server receives HTTP request and executes corresponding Tello command

## Troubleshooting

### Python Version Issues

**Error**: `Python 2.7 reached the end of its life`

**Solution**: Use `python3` instead of `python`:
```bash
python3 -m pip install -r requirements.txt
python3 example.py
```

### Import Errors

**Error**: `ModuleNotFoundError: No module named 'websockets'`

**Solution**: Install requirements:
```bash
python3 -m pip install -r requirements.txt
```

### Connection Errors

**Error**: `Failed to connect to Tello`

**Check**:
- Connected to Tello WiFi network
- Tello is powered on
- IP address is correct (default: 192.168.10.1)
- Firewall allows UDP on port 8889

### WebSocket Errors

**Error**: `Connection refused` or `WebSocket connection failed`

**Check**:
- FastAPI backend is running (`http://localhost:8000`)
- WebSocket endpoint is accessible
- No firewall blocking WebSocket connections

### No Commands Executing

**Possible causes**:
- No control bindings set up in web UI
- Brainwave patterns don't match training sessions
- Threshold too high in `process_band_powers()` method

**Solution**: Adjust pattern matching logic in `listener.py` or ensure bindings are properly configured.

## Testing Commands Manually

Before using brainwave control, test that Tello commands work:

```bash
cd DJI_Backend
python3 test_commands.py
```

## Testing Webhook Server Without Device

You can test the webhook server API without a connected Tello device:

```bash
cd DJI_Backend
python3 webhook_server.py
```

The server will start and accept API calls even if Tello is not connected. Test with:

```bash
curl -X POST http://localhost:8888/command \
  -H "Content-Type: application/json" \
  -d '{"control_id": "forward", "value": 20}'
```

This interactive script lets you:
- Test connection to Tello
- Manually send commands (takeoff, land, forward, etc.)
- Verify responses

Use this to ensure your Tello is properly connected before starting brainwave control.

## Advanced Configuration

### Custom Command Distances

Edit `commands.py` to change default distances:

```python
DEFAULT_DISTANCE = 30  # Change from 20cm to 30cm
DEFAULT_ANGLE = 45     # Change from 90° to 45°
```

### Custom Pattern Matching

Modify `process_band_powers()` in `listener.py` to implement your own brainwave pattern matching logic.

### Rate Limiting

Adjust command rate limiting in `listener.py`:

```python
self.min_command_interval = 1.0  # Increase from 0.5s to 1.0s
```

## Safety Notes

⚠️ **Important Safety Guidelines**:

- Always test in a safe, open area
- Keep Tello within line of sight
- Ensure adequate battery level before flight
- Have emergency landing procedure ready
- Test commands manually before using brainwave control
- Start with low distances (10-20cm) for testing

## License

Part of Neuro-Pilot project - Launch Fund AI Meets Robotics Hackathon
