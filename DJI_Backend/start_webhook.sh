#!/bin/bash

# Start DJI Tello Webhook Server
# Make sure you're connected to Tello's WiFi network!

cd "$(dirname "$0")"

echo "Starting DJI Tello Webhook Server..."
echo "Make sure:"
echo "  1. You're connected to Tello's WiFi network"
echo "  2. Tello IP is 192.168.10.1 (default)"
echo ""

# Check Python 3
if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 is not installed"
    exit 1
fi

# Check if requirements are installed
if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "Installing requirements..."
    python3 -m pip install -r requirements.txt
fi

# Run the webhook server
python3 webhook_server.py
