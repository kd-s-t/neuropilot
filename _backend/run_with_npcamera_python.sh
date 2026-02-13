#!/bin/bash
# Run neuropilot backend with a Python that has working cv2 (avoids conda libiconv/dlopen error).
# Unsets DYLD_LIBRARY_PATH so cv2 uses system libiconv. PYLSL_LIB can still point to conda's liblsl.
cd "$(dirname "$0")"
if [ -n "$NEUROPILOT_PYTHON" ] && [ -x "$NEUROPILOT_PYTHON" ]; then
  NP_PYTHON="$NEUROPILOT_PYTHON"
elif [ -x "/opt/homebrew/bin/python3" ]; then
  NP_PYTHON="/opt/homebrew/bin/python3"
elif [ -x "/usr/local/bin/python3" ]; then
  NP_PYTHON="/usr/local/bin/python3"
else
  NP_PYTHON=""
fi
if [ -z "$NP_PYTHON" ] || [ ! -x "$NP_PYTHON" ]; then
  echo "No system/Homebrew python3 found. Set NEUROPILOT_PYTHON to a Python with working cv2 (e.g. from np-camera env):"
  echo "  NEUROPILOT_PYTHON=/path/to/python3 ./run_with_npcamera_python.sh"
  exit 1
fi
unset DYLD_LIBRARY_PATH
if command -v conda &>/dev/null; then
  CONDA_BASE=$(conda info --base 2>/dev/null | grep -v "FutureWarning" | tail -1)
  if [ -n "$CONDA_BASE" ] && [ -f "$CONDA_BASE/lib/liblsl.dylib" ]; then
    export PYLSL_LIB="$CONDA_BASE/lib/liblsl.dylib"
  fi
fi
echo "Using np camera Python: $NP_PYTHON"
"$NP_PYTHON" --version
export NEUROPILOT_PYTHON="$NP_PYTHON"
exec ./start_server.sh
