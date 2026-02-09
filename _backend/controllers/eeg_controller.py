import numpy as np
import pandas as pd
from typing import List, Dict, Any
import asyncio
import json
import platform
import os
from datetime import datetime

# Detect platform
IS_MAC = platform.system() == "Darwin"
IS_WINDOWS = platform.system() == "Windows"
IS_LINUX = platform.system() == "Linux"
PLATFORM_NAME = "mac" if IS_MAC else "windows" if IS_WINDOWS else "linux"

# Set up LSL library path for Mac so pylsl loads when server is started without start_server.sh
if IS_MAC:
    pylsl_lib = os.environ.get('PYLSL_LIB', '')
    dyld_path = os.environ.get('DYLD_LIBRARY_PATH', '')
    if not dyld_path or not pylsl_lib:
        conda_base = None
        if os.environ.get('CONDA_PREFIX'):
            p = os.environ['CONDA_PREFIX']
            if os.path.isfile(os.path.join(p, 'lib', 'liblsl.dylib')):
                conda_base = p
            else:
                base_candidate = os.path.dirname(p)
                if os.path.isfile(os.path.join(base_candidate, 'lib', 'liblsl.dylib')):
                    conda_base = base_candidate
        if not conda_base:
            import subprocess
            try:
                out = subprocess.run(
                    ['conda', 'info', '--base'],
                    capture_output=True, text=True, timeout=5, cwd=os.path.expanduser('~')
                )
                if out.returncode == 0 and out.stdout:
                    conda_base = out.stdout.strip().splitlines()[-1].strip()
            except Exception:
                pass
        if not conda_base:
            for candidate in [os.path.expanduser('~/miniconda3'), os.path.expanduser('~/anaconda3'), '/opt/homebrew/Caskroom/miniconda/base']:
                if os.path.isfile(os.path.join(candidate, 'lib', 'liblsl.dylib')):
                    conda_base = candidate
                    break
        if conda_base:
            lsl_lib = os.path.join(conda_base, 'lib', 'liblsl.dylib')
            os.environ['PYLSL_LIB'] = lsl_lib
            existing = os.environ.get('DYLD_LIBRARY_PATH', '')
            os.environ['DYLD_LIBRARY_PATH'] = os.path.join(conda_base, 'lib') + (':' + existing if existing else '')
        else:
            lsl_framework_path = "/usr/local/opt/lsl/Frameworks"
            if os.path.exists(lsl_framework_path):
                os.environ.setdefault("DYLD_FRAMEWORK_PATH", lsl_framework_path)
                if "DYLD_FRAMEWORK_PATH" in os.environ:
                    current_path = os.environ["DYLD_FRAMEWORK_PATH"]
                    if lsl_framework_path not in current_path:
                        os.environ["DYLD_FRAMEWORK_PATH"] = f"{lsl_framework_path}:{current_path}"
    print(f"LSL library configuration: PYLSL_LIB={os.environ.get('PYLSL_LIB', 'Not set')}, DYLD_LIBRARY_PATH={os.environ.get('DYLD_LIBRARY_PATH', 'Not set')}")

try:
    from pylsl import StreamInlet, resolve_byprop
    # Try to import resolve_streams if available (might not exist in all versions)
    try:
        from pylsl import resolve_streams
    except ImportError:
        resolve_streams = None
    PYLSL_AVAILABLE = True
except (ImportError, RuntimeError, StopIteration) as e:
    PYLSL_AVAILABLE = False
    StreamInlet = None
    resolve_byprop = None
    resolve_streams = None
    print(f"pylsl not available: {e}")

class EEGController:
    def __init__(self):
        self.inlet = None
        self.brainwave_data: List[Dict[str, Any]] = []
        self.buffer: List[float] = []
        self.data_buffer = np.zeros(256)
        self.sampling_rate = 256
        self.window_size = 256
        self.buffer_size = 256 * 10
        
        self.freq_bands = {
            'Delta': (0.5, 4),
            'Theta': (4, 8),
            'Alpha': (8, 13),
            'Beta': (13, 30),
            'Gamma': (30, 100)
        }
        self.band_powers = {band: {'power': 0, 'range': (low, high)} 
                           for band, (low, high) in self.freq_bands.items()}

    def connect_to_muse(self, timeout=10):
        if not PYLSL_AVAILABLE:
            streamer = "muselsl" if IS_MAC else "bluemuse" if IS_WINDOWS else "muselsl"
            print(f"Warning: pylsl not available on {PLATFORM_NAME}. Server will continue without EEG connection.")
            if IS_MAC:
                print(f"  For mac: Make sure LSL is installed: brew install labstreaminglayer/tap/lsl")
                print(f"  And {streamer} is running: python3 -m muselsl stream")
            elif IS_WINDOWS:
                print(f"  For windows: Make sure {streamer} is installed and running")
            return False
        
        print(f"Looking for an EEG stream (timeout: {timeout}s)...")
        streamer = "muselsl" if IS_MAC else "bluemuse" if IS_WINDOWS else "muselsl"
        print(f"Platform: {PLATFORM_NAME} (using {streamer})")
        
        try:
            # First, try to list all available streams for debugging
            if resolve_streams:
                try:
                    all_streams = resolve_streams(wait_time=2.0)
                    if len(all_streams) > 0:
                        print(f"Found {len(all_streams)} LSL stream(s) available:")
                        for i, stream_info in enumerate(all_streams):
                            print(f"  Stream {i+1}: name='{stream_info.name()}', type='{stream_info.type()}', source_id='{stream_info.source_id()}'")
                    else:
                        print("No LSL streams found on the network.")
                except Exception as e:
                    print(f"Could not list streams (this is OK): {e}")
            else:
                print("resolve_streams not available, using resolve_byprop only")
            
            # Try multiple search strategies
            streams = None
            
            # Strategy 1: Search by type 'EEG'
            try:
                print("Searching for streams with type='EEG'...")
                streams = resolve_byprop('type', 'EEG', timeout=timeout)
                if len(streams) > 0:
                    print(f"Found {len(streams)} stream(s) with type='EEG'")
            except Exception as e:
                print(f"Error searching by type 'EEG': {e}")
            
            # Strategy 2: If no EEG type found, try searching by name containing 'Muse'
            if not streams or len(streams) == 0:
                try:
                    print("Searching for streams with name containing 'Muse'...")
                    streams = resolve_byprop('name', 'Muse', timeout=timeout)
                    if len(streams) > 0:
                        print(f"Found {len(streams)} stream(s) with name containing 'Muse'")
                except Exception as e:
                    print(f"Error searching by name 'Muse': {e}")
            
            # Strategy 3: Try to get any available stream (if resolve_streams is available)
            if not streams or len(streams) == 0:
                if resolve_streams:
                    try:
                        print("Searching for any available stream...")
                        streams = resolve_streams(wait_time=timeout)
                        if len(streams) > 0:
                            print(f"Found {len(streams)} stream(s) total")
                    except Exception as e:
                        print(f"Error searching for any stream: {e}")
                else:
                    print("Cannot search for any stream (resolve_streams not available)")
            
            if not streams or len(streams) == 0:
                print("Warning: Can't find any EEG stream.")
                print(f"  Make sure {streamer} is running and streaming:")
                if IS_MAC:
                    print(f"    python3 -m muselsl stream")
                elif IS_WINDOWS:
                    print(f"    Make sure {streamer} is running and connected to your Muse device")
                print(f"  Also check that LSL is properly installed and the stream is visible on the network.")
                return False
            
            # Use the first available stream
            self.inlet = StreamInlet(streams[0])
            stream_name = streams[0].name()
            stream_type = streams[0].type()
            channel_count = streams[0].channel_count()
            print(f"✓ Connected to EEG stream: {stream_name}")
            print(f"  Stream type: {stream_type}, Channels: {channel_count}")
            print(f"  Starting to read brainwave data...")
            return True
        except Exception as e:
            print(f"Warning: Could not connect to EEG stream: {e}")
            import traceback
            traceback.print_exc()
            return False

    def compute_band_powers(self, data: np.ndarray, sampling_rate: int):
        try:
            # Only compute if we have non-zero data
            if np.all(data == 0):
                return
            
            # Apply windowing to reduce spectral leakage
            windowed_data = data * np.hanning(len(data))
            
            # Compute FFT
            fft_result = np.abs(np.fft.fft(windowed_data))**2
            freqs = np.fft.fftfreq(len(data), 1.0/sampling_rate)
            
            # Only use positive frequencies
            positive_freqs = freqs[:len(freqs)//2]
            positive_fft = fft_result[:len(fft_result)//2]
            
            for band, (low, high) in self.freq_bands.items():
                # Find indices in the positive frequency range
                band_indices = [i for i in range(len(positive_freqs)) 
                              if low <= positive_freqs[i] <= high]
                if band_indices:
                    band_power = np.mean([positive_fft[i] for i in band_indices])
                    self.band_powers[band]['power'] = float(band_power)
                else:
                    self.band_powers[band]['power'] = 0.0
        except Exception as e:
            print(f"Error computing band powers: {e}")
            import traceback
            traceback.print_exc()

    async def read_brainwaves(self, clients: List):
        sample_count = 0
        last_log_time = datetime.now()
        samples_received = 0
        while True:
            if self.inlet is not None and PYLSL_AVAILABLE:
                try:
                    # pull_sample() blocks until a sample is available
                    # This is fine in an async function as it will yield control
                    sample, timestamp = self.inlet.pull_sample()
                    sample_count += 1
                    samples_received += 1
                    data = {
                        "timestamp": timestamp,
                        "sample": sample
                    }
                    self.brainwave_data.append(data)
                    self.buffer.append(sample[0] if len(sample) > 0 else 0.0)
                    
                    # Log every 5 seconds to confirm data reception
                    current_time = datetime.now()
                    if (current_time - last_log_time).total_seconds() >= 5:
                        avg_sample = np.mean(sample) if len(sample) > 0 else 0
                        max_power = max([v['power'] for v in self.band_powers.values()])
                        print(f"EEG data received: {sample_count} samples in last 5s (total: {samples_received}), sample avg: {avg_sample:.2f}, max band power: {max_power:.2f}")
                        print(f"  Band powers: {[(k, round(v['power'], 2)) for k, v in self.band_powers.items()]}")
                        last_log_time = current_time
                        sample_count = 0
                    
                    # Keep buffer size manageable
                    if len(self.brainwave_data) > 1000:
                        self.brainwave_data = self.brainwave_data[-500:]
                    if len(self.buffer) > self.buffer_size * 2:
                        self.buffer = self.buffer[-self.buffer_size:]
                    
                    # Update data buffer and compute band powers
                    self.data_buffer = np.roll(self.data_buffer, -1)
                    # Use the first channel or average if multiple channels
                    sample_value = sample[0] if len(sample) > 0 else 0.0
                    self.data_buffer[-1] = sample_value
                    
                    # Compute band powers (will work even with zeros initially)
                    self.compute_band_powers(self.data_buffer, self.sampling_rate)
                    
                    for client in clients[:]:  # Copy list to avoid modification during iteration
                        try:
                            await client.send_text(json.dumps(data))
                        except Exception:
                            if client in clients:
                                clients.remove(client)
                except Exception as e:
                    print(f"Error reading brainwaves: {e}")
                    await asyncio.sleep(0.1)
            else:
                if self.inlet is None:
                    if sample_count == 0:  # Only log once
                        print("EEG inlet is None - waiting for connection...")
                await asyncio.sleep(1)

    def get_brainwaves(self, limit: int = 10) -> List[Dict]:
        df = pd.DataFrame(self.brainwave_data)
        if len(df) == 0:
            return []
        return df.tail(limit).to_dict(orient="records")

    def get_band_powers(self) -> Dict:
        return self.band_powers
