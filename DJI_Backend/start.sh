#!/bin/bash

# Start DJI Tello Listener
# Make sure FastAPI backend is running first!

cd "$(dirname "$0")"

echo "Starting DJI Tello Listener..."
echo "Make sure:"
echo "  1. FastAPI backend is running (http://localhost:8000)"
echo "  2. You're connected to Tello's WiFi network"
echo "  3. Tello IP is 192.168.10.1 (default)"
echo ""

# Check Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 is not installed or not in PATH"
    echo "Please install Python 3.7 or higher"
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1)
echo "Using: $PYTHON_VERSION"

# Verify Python 3
PYTHON_MAJOR=$(python3 -c "import sys; print(sys.version_info.major)")
if [ "$PYTHON_MAJOR" -lt 3 ]; then
    echo "ERROR: Python 3 is required (found Python $PYTHON_MAJOR)"
    exit 1
fi

# Check if requirements are installed
if ! python3 -c "import websockets" 2>/dev/null; then
    echo "Installing requirements..."
    python3 -m pip install -r requirements.txt
fi

# Run the example
python3 example.py
