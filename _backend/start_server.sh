#!/bin/bash

# Start FastAPI server with LSL support
# This script detects the platform and sets up environment accordingly.
# To use the same Python as np camera (e.g. for working cv2/DJI Camera): from np camera backend run
#   which python
# then start neuropilot with that interpreter:
#   NEUROPILOT_PYTHON=/path/from/which/python ./start_server.sh
# (That Python must have neuropilot deps installed: pip install -r requirements.txt)

PLATFORM=$(uname -s)

if [ "$PLATFORM" = "Darwin" ]; then
    echo "Detected: mac (using muselsl)"
    if [ -z "$NEUROPILOT_PYTHON" ]; then
        if command -v conda &> /dev/null; then
            CONDA_BASE=$(conda info --base 2>/dev/null | grep -v "FutureWarning" | tail -1)
            if [ -f "$CONDA_BASE/lib/liblsl.dylib" ]; then
                if [ -z "$DYLD_LIBRARY_PATH" ]; then
                    export DYLD_LIBRARY_PATH=$CONDA_BASE/lib
                else
                    if [[ ":$DYLD_LIBRARY_PATH:" != *":$CONDA_BASE/lib:"* ]]; then
                        export DYLD_LIBRARY_PATH=$CONDA_BASE/lib:$DYLD_LIBRARY_PATH
                    fi
                fi
                export PYLSL_LIB="$CONDA_BASE/lib/liblsl.dylib"
                echo "Using conda LSL library (arm64): $PYLSL_LIB"
                echo "DYLD_LIBRARY_PATH: $DYLD_LIBRARY_PATH"
            fi
        fi
    else
        echo "Using NEUROPILOT_PYTHON (keeping existing DYLD_LIBRARY_PATH for cv2/libiconv)"
    fi
    # Fallback to homebrew framework path
    if [ -z "$PYLSL_LIB" ] && [ -d "/usr/local/opt/lsl/Frameworks" ]; then
        export DYLD_FRAMEWORK_PATH=/usr/local/opt/lsl/Frameworks:$DYLD_FRAMEWORK_PATH
        echo "Using homebrew LSL framework"
    fi
    echo "Make sure muselsl is running: python3 -m muselsl stream"
    echo "Note: If psycopg2 fails, install it via conda: conda install -c conda-forge psycopg2"
elif [ "$PLATFORM" = "Linux" ]; then
    echo "Detected: linux (using muselsl)"
    echo "Make sure muselsl is running: muselsl stream"
else
    echo "Detected: windows (using bluemuse)"
    echo "Make sure bluemuse is running"
fi

cd "$(dirname "$0")"
if [ -n "$NEUROPILOT_PYTHON" ] && [ -x "$NEUROPILOT_PYTHON" ]; then
    exec "$NEUROPILOT_PYTHON" -m uvicorn app:app --reload --host 0.0.0.0 --port 8000
fi
if [ "$PLATFORM" = "Darwin" ] && [ -n "$CONDA_BASE" ] && [ -f "$CONDA_BASE/bin/python" ]; then
    exec "$CONDA_BASE/bin/python" -m uvicorn app:app --reload --host 0.0.0.0 --port 8000
fi
python3 -m uvicorn app:app --reload --host 0.0.0.0 --port 8000
