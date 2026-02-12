#!/bin/bash
# Run neuropilot backend with the same Python that np camera uses (Python 3.10 with working cv2).
# Do NOT set DYLD_LIBRARY_PATH so cv2 uses /usr/lib/libiconv (working). PYLSL_LIB still points to conda's liblsl.
cd "$(dirname "$0")"
NP_PYTHON="/usr/local/bin/python3"
if [ ! -x "$NP_PYTHON" ]; then
  echo "Python not found: $NP_PYTHON"
  echo "From np camera backend dir run: which python3"
  echo "Then: NEUROPILOT_PYTHON=/path/to/python3 ./start_server.sh"
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
