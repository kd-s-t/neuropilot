# Mac M1/M2 Muse Setup

This directory contains setup instructions for streaming Muse EEG data on Mac (Apple Silicon) using muselsl.

**Status:** Fully working and tested on Mac M1/M2

## Prerequisites

- Mac with Apple Silicon (M1, M2, etc.)
- Bluetooth enabled
- Python 3.8+ installed
- Muse headset (Muse 2, Muse S, etc.)
- Conda (recommended for LSL library arm64 compatibility)

## Installation

1. **Install muselsl:**
   ```bash
   python3 -m pip install muselsl
   ```

   Or install from requirements:
   ```bash
   python3 -m pip install -r requirements.txt
   ```

2. **Install LSL library (arm64 compatible):**
   ```bash
   conda install -c conda-forge liblsl -y
   ```

   This installs the arm64-compatible LSL library that muselsl needs.

3. **Verify Bluetooth is enabled:**
   - Open System Settings → Bluetooth
   - Ensure Bluetooth is turned on

## Usage

1. **Power on your Muse headset:**
   - Press and hold the power button until the LED lights turn on
   - The headset should be in pairing mode

2. **Start muselsl stream (Recommended):**
   ```bash
   ./start_muselsl.sh
   ```

   This script automatically configures the LSL library path.

   **Or manually:**
   ```bash
   export DYLD_LIBRARY_PATH=$(conda info --base)/lib:$DYLD_LIBRARY_PATH
   python3 -m muselsl stream
   ```

3. **muselsl will:**
   - Search for available Muse devices
   - Connect to your Muse headset via BLE (Bluetooth Low Energy)
   - Stream EEG data to LSL (Lab Streaming Layer)

4. **Keep this terminal running** while you use the app.

5. **In a separate terminal, start the NeuroPilot backend:**
   ```bash
   cd ../_Backend
   ./start_server.sh
   ```

   The backend does not search for a Muse stream at startup. When muselsl is running, use `POST /eeg/reconnect` from the app or API to connect to the LSL stream.

## Troubleshooting

- **Can't find Muse device?**
  - Ensure your Muse is powered on and in pairing mode
  - Check that Bluetooth is enabled in System Settings
  - Try moving the Muse closer to your Mac
  - Restart Bluetooth: System Settings → Bluetooth → Turn off, then Turn on

- **Connection drops?**
  - Ensure no other apps are connected to the Muse
  - Check battery level on the Muse
  - Try disconnecting and reconnecting

- **muselsl not found?**
  - Make sure muselsl is installed: `python3 -m pip install muselsl`
  - Use `python3 -m muselsl stream` instead of just `muselsl stream`

- **LSL library error (architecture mismatch)?**
  - Install LSL via conda: `conda install -c conda-forge liblsl -y`
  - Use the provided `start_muselsl.sh` script which sets the library path automatically
  - Or manually set: `export DYLD_LIBRARY_PATH=$(conda info --base)/lib:$DYLD_LIBRARY_PATH`

## Notes

- **Successfully tested** on Mac M1/M2 with muselsl
- muselsl streams data to LSL (Lab Streaming Layer), which the FastAPI backend reads via `pylsl`
- This is the Mac equivalent of BlueMuse on Windows
- Both platforms stream to LSL, so the backend code works the same way
- The FastAPI backend automatically detects Mac platform and uses the correct LSL library (conda arm64 version)

## Backend Integration

The NeuroPilot backend (`_Backend/start_server.sh`) automatically:
- Detects Mac platform
- Configures the LSL library path for arm64 compatibility

Use `POST /eeg/reconnect` when muselsl is running to connect the backend to the LSL stream.

**To start the full system:**
1. Start muselsl (this directory): `cd Muselsl && ./start_muselsl.sh`
2. Start NeuroPilot backend: `cd ../_Backend && ./start_server.sh`
3. Start frontend: `cd ../_Frontned && npm run dev`
