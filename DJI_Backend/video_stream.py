"""
Tello video stream: receive H.264 over UDP 11111, decode to JPEG, expose latest frame.
Uses Tello-Python pipeline when OpenCV is available: UDP -> TCP -> OpenCV (reliable decode).
Falls back to PyAV when OpenCV is not installed.
"""

import io
import queue
import socket
import threading
import time
from typing import Optional

try:
    import av
except ImportError:
    av = None

# Import cv2 only when needed (av path first) to avoid duplicate libavdevice with av
cv2 = None


def _ensure_cv2():
    global cv2
    if cv2 is None:
        try:
            import cv2 as _cv2
            cv2 = _cv2
        except ImportError:
            pass
    return cv2

VIDEO_PORT = 11111
TCP_VIDEO_PORT = 12345
# Tello-Python: frame is complete when we receive a packet with len != 1460
PACKET_FULL_SIZE = 1460
MAX_BUFFER = 1024 * 1024  # 1MB cap

_latest_jpeg: Optional[bytes] = None
_has_received_frames = False
_lock = threading.Lock()
_receiver_socket: Optional[socket.socket] = None
_tcp_socket: Optional[socket.socket] = None
_receiver_running = False
_receiver_thread: Optional[threading.Thread] = None
_tcp_thread: Optional[threading.Thread] = None
_opencv_thread: Optional[threading.Thread] = None
_frame_queue: Optional[queue.Queue] = None


def _udp_receiver_loop_opencv():
    """UDP receiver: frame by len!=1460 or by NAL start codes; put H.264 in queue."""
    global _receiver_socket, _receiver_running, _frame_queue
    buffer = bytearray()
    packet_count = 0
    while _receiver_running and _receiver_socket and _frame_queue is not None:
        try:
            _receiver_socket.settimeout(1.0)
            data, addr = _receiver_socket.recvfrom(2048)
            if not data:
                continue
            packet_count += 1
            if packet_count == 1:
                print("Tello video: first UDP packet received (%d bytes) from %s" % (len(data), addr))
            elif packet_count <= 5 or packet_count % 500 == 0:
                print("Tello video: UDP packets so far: %d" % packet_count)
            buffer.extend(data)
            if len(buffer) > MAX_BUFFER:
                buffer = buffer[-MAX_BUFFER // 2 :]
            chunk = None
            if len(data) != PACKET_FULL_SIZE and len(buffer) > 0:
                chunk = bytes(buffer)
                buffer.clear()
            else:
                first = _find_nal_start(buffer)
                if first >= 0:
                    second = _next_nal_start(buffer, first)
                    if second > first:
                        chunk = bytes(buffer[first:second])
                        buffer[:] = buffer[second:]
            if chunk:
                try:
                    _frame_queue.put_nowait(chunk)
                except queue.Full:
                    try:
                        _frame_queue.get_nowait()
                    except queue.Empty:
                        pass
                    try:
                        _frame_queue.put_nowait(chunk)
                    except queue.Full:
                        pass
        except socket.timeout:
            continue
        except Exception as e:
            if _receiver_running:
                print("Tello video UDP recv error:", e)
            break
    _receiver_socket = None


def _tcp_writer_loop():
    """TCP server: accept clients in a loop, write H.264 frames from queue to current client."""
    global _tcp_socket, _receiver_running, _frame_queue
    if _tcp_socket is None or _frame_queue is None:
        return
    while _receiver_running and _tcp_socket:
        try:
            _tcp_socket.settimeout(5.0)
            conn, _ = _tcp_socket.accept()
            conn.settimeout(None)
            while _receiver_running:
                try:
                    frame = _frame_queue.get(timeout=1.0)
                    conn.sendall(frame)
                except queue.Empty:
                    continue
                except (BrokenPipeError, ConnectionResetError, OSError):
                    break
            try:
                conn.close()
            except Exception:
                pass
        except socket.timeout:
            continue
        except Exception as e:
            if _receiver_running and _tcp_socket:
                print("Tello video TCP writer error:", e)
            break


def _opencv_loop():
    """OpenCV: connect to TCP stream, read frames, encode to JPEG."""
    global _latest_jpeg, _has_received_frames, _receiver_running, _lock
    frame_count = 0
    while _receiver_running and _ensure_cv2():
        try:
            cap = cv2.VideoCapture("tcp://127.0.0.1:%d" % TCP_VIDEO_PORT)
            if not cap.isOpened():
                print("Tello video: OpenCV cap failed to open tcp://127.0.0.1:%d" % TCP_VIDEO_PORT)
                time.sleep(2)
                continue
            print("Tello video: OpenCV cap opened, reading frames...")
            read_fail_count = 0
            while _receiver_running and cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    read_fail_count += 1
                    if read_fail_count == 1 or read_fail_count % 100 == 0:
                        print("Tello video: OpenCV read() returned False (count=%d)" % read_fail_count)
                    break
                read_fail_count = 0
                _, jpeg = cv2.imencode(".jpg", frame)
                if jpeg is not None:
                    frame_count += 1
                    _has_received_frames = True
                    if frame_count == 1 or frame_count % 30 == 0:
                        print("Tello video: decoded frame #%d (JPEG %d bytes)" % (frame_count, len(jpeg)))
                    with _lock:
                        _latest_jpeg = jpeg.tobytes()
            cap.release()
        except Exception as e:
            if _receiver_running:
                print("Tello video OpenCV error:", e)
        if _receiver_running:
            time.sleep(2)
    print("Tello video: OpenCV loop stopped")


def start_receiver() -> bool:
    global _receiver_socket, _receiver_running, _receiver_thread
    global _tcp_socket, _tcp_thread, _opencv_thread, _frame_queue
    if _receiver_running:
        return True
    try:
        _receiver_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        _receiver_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        _receiver_socket.bind(("", VIDEO_PORT))
        _receiver_running = True
        # Prefer PyAV for decode (handles raw H.264 better than OpenCV over TCP)
        if av:
            _receiver_thread = threading.Thread(target=_receiver_loop_pyav, daemon=True)
            _receiver_thread.start()
            print("Tello video receiver started on port %d (PyAV decode)" % VIDEO_PORT)
        elif _ensure_cv2():
            _frame_queue = queue.Queue(maxsize=1)
            _receiver_thread = threading.Thread(target=_udp_receiver_loop_opencv, daemon=True)
            _receiver_thread.start()
            _tcp_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            _tcp_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            _tcp_socket.bind(("127.0.0.1", TCP_VIDEO_PORT))
            _tcp_socket.listen(1)
            _tcp_thread = threading.Thread(target=_tcp_writer_loop, daemon=True)
            _tcp_thread.start()
            time.sleep(0.5)
            _opencv_thread = threading.Thread(target=_opencv_loop, daemon=True)
            _opencv_thread.start()
            print("Tello video receiver started on port %d (UDP->TCP->OpenCV)" % VIDEO_PORT)
        else:
            _receiver_thread = threading.Thread(target=_receiver_loop_pyav, daemon=True)
            _receiver_thread.start()
            print("Tello video receiver started on port %d (PyAV)" % VIDEO_PORT)
        return True
    except Exception as e:
        print("Tello video receiver failed to start:", e)
        return False


def stop_receiver():
    global _receiver_running, _receiver_socket, _receiver_thread
    global _tcp_socket, _tcp_thread, _opencv_thread, _frame_queue
    _receiver_running = False
    if _receiver_socket:
        try:
            _receiver_socket.close()
        except Exception:
            pass
        _receiver_socket = None
    if _tcp_socket:
        try:
            _tcp_socket.close()
        except Exception:
            pass
        _tcp_socket = None
    for t in (_receiver_thread, _tcp_thread, _opencv_thread):
        if t:
            t.join(timeout=2.0)
    _receiver_thread = _tcp_thread = _opencv_thread = None
    print("Tello video receiver stopped")


def get_latest_jpeg() -> Optional[bytes]:
    with _lock:
        return _latest_jpeg


def is_receiver_running() -> bool:
    return _receiver_running


def has_received_frames() -> bool:
    return _has_received_frames


# --- PyAV fallback (when OpenCV not available) ---

def _find_nal_start(data: bytes, from_pos: int = 0) -> int:
    i = from_pos
    while i < len(data) - 2:
        if data[i : i + 2] == b"\x00\x00":
            if i + 3 <= len(data) and data[i + 2] == 0x01:
                return i
            if i + 4 <= len(data) and data[i + 2] == 0x00 and data[i + 3] == 0x01:
                return i
        i += 1
    return -1


def _next_nal_start(data: bytes, after: int) -> int:
    """Index of next NAL start code after byte index 'after'."""
    skip = after + 3
    if after + 4 <= len(data) and data[after + 2] == 0x00 and data[after + 3] == 0x01:
        skip = after + 4
    elif after + 3 <= len(data):
        skip = after + 3
    return _find_nal_start(data, skip)


# Feed full access units (SPS + PPS + slice): need several NALs per parse() call.
NALS_PER_CHUNK = 4
MIN_CHUNK_BYTES = 500  # skip decode for tiny chunks (e.g. 8-byte fragments)
BULK_DEMUX_THRESHOLD = 30000  # try demux on whole buffer when this large (bytes)


def _take_nal_chunk(buffer: bytearray) -> Optional[bytes]:
    """Take up to NALS_PER_CHUNK NAL units from buffer; remove them from buffer."""
    first = _find_nal_start(buffer)
    if first < 0:
        return None
    pos = first
    for _ in range(NALS_PER_CHUNK):
        next_pos = _next_nal_start(buffer, pos)
        if next_pos < 0:
            return None
        pos = next_pos
    chunk = bytes(buffer[first:pos])
    buffer[:] = buffer[pos:]
    return chunk


def _frame_to_jpeg(frame) -> Optional[bytes]:
    if not av or frame is None:
        return None
    try:
        buf = av.BytesIO()
        out = av.open(buf, "w", format="mjpeg")
        stream = out.add_stream("mjpeg", rate=30)
        stream.width = frame.width
        stream.height = frame.height
        stream.pix_fmt = "yuv420p"
        for packet in stream.encode(frame):
            out.mux(packet)
        out.close()
        return buf.getvalue()
    except Exception:
        return None


def _parse_and_decode(codec: "av.CodecContext", data: bytes) -> Optional[bytes]:
    """Feed NAL data to codec.parse(); decode any packet and return first frame as JPEG."""
    if not av or not codec or not data:
        return None
    if len(data) < 4:
        return None
    try:
        for packet in codec.parse(data):
            for frame in codec.decode(packet):
                return _frame_to_jpeg(frame)
    except Exception:
        pass
    return None


def _demux_decode(data: bytes) -> Optional[bytes]:
    """Open raw H.264 bytes as container; return first decoded frame as JPEG."""
    if not av or len(data) < 4:
        return None
    try:
        demux = av.open(io.BytesIO(data), format="h264")
        for frame in demux.decode(video=0):
            return _frame_to_jpeg(frame)
    except Exception:
        pass
    return None


def _receiver_loop_pyav():
    """PyAV fallback: UDP receiver + PyAV decode (may not decode Tello stream reliably)."""
    global _latest_jpeg, _has_received_frames, _receiver_running, _receiver_socket
    buffer = bytearray()
    codec = None
    packet_count = 0
    frame_count = 0
    timeout_count = 0
    bulk_demux_no_frame_logged = False
    if av:
        try:
            codec = av.CodecContext.create("h264", "r")
        except Exception as e:
            print("Tello video H.264 codec init failed:", e)
    while _receiver_running and _receiver_socket:
        try:
            _receiver_socket.settimeout(1.0)
            data, addr = _receiver_socket.recvfrom(2048)
            if not data:
                continue
            packet_count += 1
            if packet_count == 1:
                print("Tello video: first UDP packet received (%d bytes) from %s" % (len(data), addr))
            elif packet_count <= 5 or packet_count % 500 == 0:
                print("Tello video: UDP packets so far: %d" % packet_count)
            buffer.extend(data)
            if len(buffer) > MAX_BUFFER:
                buffer = buffer[-MAX_BUFFER // 2 :]
            if codec and frame_count == 0 and len(buffer) >= BULK_DEMUX_THRESHOLD:
                bulk = bytes(buffer)
                jpeg = _demux_decode(bulk)
                if not jpeg and len(bulk) >= 50000 and not bulk_demux_no_frame_logged:
                    bulk_demux_no_frame_logged = True
                    print("Tello video: bulk demux attempted (%d bytes), no frame - video decoding not supported for this Tello stream" % len(bulk))
                if jpeg:
                    frame_count += 1
                    _has_received_frames = True
                    print("Tello video: decoded frame #1 (JPEG %d bytes) via bulk demux" % len(jpeg))
                    with _lock:
                        _latest_jpeg = jpeg
                    buffer.clear()
            chunk = None
            if frame_count > 0:
                if len(data) != PACKET_FULL_SIZE and len(buffer) > 0:
                    chunk = bytes(buffer)
                    buffer.clear()
                else:
                    chunk = _take_nal_chunk(buffer)
            elif frame_count == 0 and packet_count % 500 == 0 and len(buffer) >= 1000:
                print("Tello video: accumulating for bulk demux (%d bytes, need %d)" % (len(buffer), BULK_DEMUX_THRESHOLD))
            if chunk and codec and len(chunk) >= MIN_CHUNK_BYTES:
                jpeg = _parse_and_decode(codec, chunk)
                if not jpeg and frame_count == 0:
                    jpeg = _demux_decode(chunk)
                if jpeg:
                    frame_count += 1
                    _has_received_frames = True
                    if frame_count == 1 or frame_count % 30 == 0:
                        print("Tello video: decoded frame #%d (JPEG %d bytes)" % (frame_count, len(jpeg)))
                    with _lock:
                        _latest_jpeg = jpeg
                elif frame_count == 0 and packet_count % 100 == 0:
                    print("Tello video: PyAV decode no frame yet (chunk %d bytes, packets %d)" % (len(chunk), packet_count))
        except socket.timeout:
            timeout_count += 1
            if packet_count == 0 and timeout_count % 30 == 0:
                print("Tello video: listening on %d, no UDP yet (connect to Tello Wi-Fi, send streamon)" % VIDEO_PORT)
            continue
        except Exception as e:
            if _receiver_running:
                print("Tello video recv error:", e)
            break
    _receiver_socket = None
