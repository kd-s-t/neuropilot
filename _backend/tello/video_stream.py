"""
Tello video: receive stream and serve MJPEG.
Working reference: neruopilot-camera/backend/main.py (connect -> streamon -> cv2.VideoCapture(udp://@0.0.0.0:11111, CAP_FFMPEG) -> generate() read/imencode -> MJPEG).
Keep this pipeline aligned with that when changing.
"""
import io
import queue
import socket
import threading
import time
from typing import Optional, Generator

try:
    import av
except ImportError:
    av = None

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

cap = None
stream_active = False
_connect_lock = threading.Lock()
cancel_connect = False


def _release_capture():
    global cap
    c = cap
    cap = None
    if c is not None:
        try:
            c.release()
        except Exception:
            pass


def _open_stream_thread():
    global cap, cancel_connect
    if not _ensure_cv2():
        return
    try:
        c = cv2.VideoCapture("udp://@0.0.0.0:11111", cv2.CAP_FFMPEG)
        if not c.isOpened():
            return
        try:
            c.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass
        with _connect_lock:
            if cancel_connect:
                try:
                    c.release()
                except Exception:
                    pass
            else:
                cap = c
    except Exception:
        pass


def start_ffmpeg_stream() -> bool:
    global stream_active, cancel_connect
    if not _ensure_cv2():
        return False
    with _connect_lock:
        if cap is not None and cap.isOpened():
            return True
    stream_active = True
    cancel_connect = False
    t = threading.Thread(target=_open_stream_thread, daemon=True)
    t.start()
    return True


def stop_ffmpeg_stream():
    global stream_active, cap, cancel_connect
    stream_active = False
    with _connect_lock:
        cancel_connect = True
    _release_capture()


def generate_ffmpeg_frames() -> Generator[bytes, None, None]:
    fail_count = 0
    max_fails = 150
    while stream_active:
        c = cap
        if c is None:
            time.sleep(0.2)
            continue
        try:
            success, frame = c.read()
        except Exception:
            fail_count += 1
            if fail_count >= max_fails:
                _release_capture()
                break
            continue
        if not success:
            fail_count += 1
            if fail_count >= max_fails:
                _release_capture()
                break
            continue
        fail_count = 0
        try:
            _, buffer = cv2.imencode(".jpg", frame)
            if buffer is not None:
                yield buffer.tobytes()
        except Exception:
            pass


def is_ffmpeg_stream_available() -> bool:
    return cap is not None and cap.isOpened()


def is_ffmpeg_stream_active() -> bool:
    return stream_active

VIDEO_PORT = 11111
TCP_VIDEO_PORT = 12345
PACKET_FULL_SIZE = 1460
MAX_BUFFER = 1024 * 1024

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
    global _latest_jpeg, _has_received_frames, _receiver_running, _lock
    frame_count = 0
    while _receiver_running and _ensure_cv2():
        try:
            cap = cv2.VideoCapture("tcp://127.0.0.1:%d" % TCP_VIDEO_PORT)
            if not cap.isOpened():
                time.sleep(2)
                continue
            read_fail_count = 0
            while _receiver_running and cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    read_fail_count += 1
                    break
                read_fail_count = 0
                _, jpeg = cv2.imencode(".jpg", frame)
                if jpeg is not None:
                    frame_count += 1
                    _has_received_frames = True
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
        if av:
            _receiver_thread = threading.Thread(target=_receiver_loop_pyav, daemon=True)
            _receiver_thread.start()
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
        else:
            _receiver_thread = threading.Thread(target=_receiver_loop_pyav, daemon=True)
            _receiver_thread.start()
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
    skip = after + 3
    if after + 4 <= len(data) and data[after + 2] == 0x00 and data[after + 3] == 0x01:
        skip = after + 4
    elif after + 3 <= len(data):
        skip = after + 3
    return _find_nal_start(data, skip)


NALS_PER_CHUNK = 4
MIN_CHUNK_BYTES = 500
BULK_DEMUX_THRESHOLD = 30000


def _take_nal_chunk(buffer: bytearray) -> Optional[bytes]:
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


def _parse_and_decode(codec, data: bytes) -> Optional[bytes]:
    if not av or not codec or not data or len(data) < 4:
        return None
    try:
        for packet in codec.parse(data):
            for frame in codec.decode(packet):
                return _frame_to_jpeg(frame)
    except Exception:
        pass
    return None


def _demux_decode(data: bytes) -> Optional[bytes]:
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
        except Exception:
            pass
    while _receiver_running and _receiver_socket:
        try:
            _receiver_socket.settimeout(1.0)
            data, addr = _receiver_socket.recvfrom(2048)
            if not data:
                continue
            packet_count += 1
            buffer.extend(data)
            if len(buffer) > MAX_BUFFER:
                buffer = buffer[-MAX_BUFFER // 2 :]
            if codec and frame_count == 0 and len(buffer) >= BULK_DEMUX_THRESHOLD:
                bulk = bytes(buffer)
                jpeg = _demux_decode(bulk)
                if not jpeg and len(bulk) >= 50000 and not bulk_demux_no_frame_logged:
                    bulk_demux_no_frame_logged = True
                if jpeg:
                    frame_count += 1
                    _has_received_frames = True
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
            if chunk and codec and len(chunk) >= MIN_CHUNK_BYTES:
                jpeg = _parse_and_decode(codec, chunk)
                if not jpeg and frame_count == 0:
                    jpeg = _demux_decode(chunk)
                if jpeg:
                    frame_count += 1
                    _has_received_frames = True
                    with _lock:
                        _latest_jpeg = jpeg
        except socket.timeout:
            timeout_count += 1
            continue
        except Exception as e:
            if _receiver_running:
                print("Tello video recv error:", e)
            break
    _receiver_socket = None
