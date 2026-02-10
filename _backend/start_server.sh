#!/bin/bash

# Start FastAPI server with LSL support
# This script detects the platform and sets up environment accordingly

PLATFORM=$(uname -s)

if [ "$PLATFORM" = "Darwin" ]; then
    echo "Detected: mac (using muselsl)"
    # Set LSL library path to match muselsl (must use same conda LSL library)
    if command -v conda &> /dev/null; then
        CONDA_BASE=$(conda info --base 2>/dev/null | grep -v "FutureWarning" | tail -1)
        if [ -f "$CONDA_BASE/lib/liblsl.dylib" ]; then
            # Set DYLD_LIBRARY_PATH like muselsl does (prepend, don't replace)
            # This allows LSL to be found while system libraries still work
            if [ -z "$DYLD_LIBRARY_PATH" ]; then
                export DYLD_LIBRARY_PATH=$CONDA_BASE/lib
            else
                # Only add if not already there
                if [[ ":$DYLD_LIBRARY_PATH:" != *":$CONDA_BASE/lib:"* ]]; then
                    export DYLD_LIBRARY_PATH=$CONDA_BASE/lib:$DYLD_LIBRARY_PATH
                fi
            fi
            export PYLSL_LIB="$CONDA_BASE/lib/liblsl.dylib"
            echo "Using conda LSL library (arm64): $PYLSL_LIB"
            echo "DYLD_LIBRARY_PATH: $DYLD_LIBRARY_PATH"
        fi
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
if [ "$PLATFORM" = "Darwin" ] && [ -n "$CONDA_BASE" ] && [ -f "$CONDA_BASE/bin/python" ]; then
    exec "$CONDA_BASE/bin/python" -m uvicorn app:app --reload --host 0.0.0.0 --port 8000
fi
python3 -m uvicorn app:app --reload --host 0.0.0.0 --port 8000
