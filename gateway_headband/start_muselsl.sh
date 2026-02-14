#!/bin/bash

# Start muselsl stream for Mac with proper LSL library configuration
# This script connects to your Muse headset and streams EEG data to LSL

set -e

echo "Starting muselsl stream..."
echo ""

PYTHON="python3"
if command -v conda &> /dev/null; then
    CONDA_BASE=$(conda info --base 2>/dev/null | grep -v "FutureWarning" | tail -1)
    if [ -d "$CONDA_BASE/lib" ] && [ -f "$CONDA_BASE/lib/liblsl.dylib" ] && [ -x "$CONDA_BASE/bin/python" ]; then
        export DYLD_LIBRARY_PATH=$CONDA_BASE/lib:$DYLD_LIBRARY_PATH
        PYTHON="$CONDA_BASE/bin/python"
        echo "Using conda Python and LSL (arm64): $CONDA_BASE"
    fi
fi

if ! $PYTHON -m muselsl --help &> /dev/null; then
    echo "Error: muselsl is not installed for this Python."
    echo "Install with: $PYTHON -m pip install muselsl bleak"
    exit 1
fi

echo "Connecting to Muse headset..."
echo "Make sure your Muse is powered on and in pairing mode."
echo ""
exec $PYTHON -m muselsl stream --backend bleak
