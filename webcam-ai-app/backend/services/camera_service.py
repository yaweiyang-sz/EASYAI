"""
Camera Service Module
Core functionality for camera stream management with algorithm integration support.
Uses a dedicated frame reader thread per camera to avoid thread-safety issues
with cv2.VideoCapture (which is NOT thread-safe).
"""

import cv2
import uuid
import asyncio
import base64
import json
import os
import numpy as np
import threading
import time
from typing import Dict, Optional, Callable, Any
from models import Camera, CameraCreate, CameraUpdate, AlgorithmConfig


class ConnectionStatus:
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"


class FrameReaderThread:
    """
    Single dedicated thread that continuously reads frames from a cv2.VideoCapture
    and stores the latest frame for async consumers.
    This is the ONLY thread that touches the VideoCapture object.
    """
    def __init__(self, camera_id: str, source: str, camera_type: str):
        self.camera_id = camera_id
        self.source = source
        self.camera_type = camera_type
        self.cap: Optional[cv2.VideoCapture] = None
        self.status = ConnectionStatus.DISCONNECTED
        self.latest_frame: Optional[np.ndarray] = None
        self.latest_frame_ts: float = 0.0
        self.frame_lock = threading.Lock()
        self.error_count = 0
        self.max_errors = 10
        self.stop_event = threading.Event()
        self.thread: Optional[threading.Thread] = None

    def start(self):
        """Start the frame reader thread."""
        if self.thread and self.thread.is_alive():
            return
        self.stop_event.clear()
        self.thread = threading.Thread(target=self._run, daemon=True, name=f"fr-{self.camera_id[:8]}")
        self.thread.start()

    def request_stop(self):
        """Signal the thread to stop (non-blocking)."""
        self.stop_event.set()
        # Release cap immediately to unblock any stuck read()
        if self.cap:
            try:
                self.cap.release()
            except Exception:
                pass
            self.cap = None

    def join(self, timeout: float = 2.0):
        """Wait for the thread to finish (blocking, call from executor)."""
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=timeout)

    def get_latest_frame(self) -> Optional[np.ndarray]:
        """Get the latest frame (thread-safe, non-blocking)."""
        with self.frame_lock:
            if self.latest_frame is not None:
                return self.latest_frame.copy()
            return None

    def _open_cap(self) -> bool:
        """Open the video capture. Returns True on success."""
        source = self.source
        try:
            if self.camera_type in ("usb", "integrated"):
                if isinstance(source, str) and source.isdigit():
                    source = int(source)

            if isinstance(source, str) and source.startswith('rtsp'):
                cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
                cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
                cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 3000)
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    self.cap = cap
                    return True
                else:
                    cap.release()
            elif isinstance(source, str) and (source.startswith('http://') or source.startswith('https://')):
                cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
                cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
                cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 3000)
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    self.cap = cap
                    return True
                else:
                    cap.release()
            else:
                cap = cv2.VideoCapture(source)
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    self.cap = cap
                    return True
                else:
                    cap.release()
        except Exception as e:
            print(f"[ERROR] Failed to open stream {source}: {e}")

        return False

    def _run(self):
        """Main loop that continuously reads frames."""
        print(f"[INFO] Frame reader started for camera {self.camera_id}")

        while not self.stop_event.is_set():
            # Try to connect
            if self.cap is None or not self.cap.isOpened():
                self.status = ConnectionStatus.CONNECTING
                if self._open_cap():
                    self.status = ConnectionStatus.CONNECTED
                    self.error_count = 0
                    print(f"[INFO] Connected to camera {self.camera_id}")
                else:
                    self.status = ConnectionStatus.RECONNECTING
                    self.stop_event.wait(2.0)
                    continue

            # Read a frame
            try:
                ret, frame = self.cap.read()
                if ret and frame is not None:
                    with self.frame_lock:
                        self.latest_frame = frame
                        self.latest_frame_ts = time.time()
                    self.error_count = 0
                else:
                    self.error_count += 1
                    if self.error_count >= self.max_errors:
                        print(f"[ERROR] Too many read errors for {self.camera_id}, reconnecting...")
                        try:
                            self.cap.release()
                        except Exception:
                            pass
                        self.cap = None
                        self.status = ConnectionStatus.DISCONNECTED
                        self.error_count = 0
                        self.stop_event.wait(2.0)
            except Exception as e:
                self.error_count += 1
                print(f"[ERROR] Frame read exception for {self.camera_id}: {e}")
                if self.error_count >= self.max_errors:
                    try:
                        self.cap.release()
                    except Exception:
                        pass
                    self.cap = None
                    self.status = ConnectionStatus.DISCONNECTED
                    self.error_count = 0
                    self.stop_event.wait(2.0)

        print(f"[INFO] Frame reader stopped for camera {self.camera_id}")


class CameraService:
    """Camera service for stream management and algorithm integration"""

    def __init__(self):
        self.cameras: Dict[str, Camera] = {}
        self.frame_readers: Dict[str, FrameReaderThread] = {}
        self._lock = asyncio.Lock()

        self._pre_processors: Dict[str, Callable] = {}

        self._data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
        self._data_file = os.path.join(self._data_dir, 'cameras.json')

        os.makedirs(self._data_dir, exist_ok=True)

        self._load_cameras()

    # =========================================================================
    # Persistence
    # =========================================================================

    def _load_cameras(self):
        if not os.path.exists(self._data_file):
            return
        try:
            with open(self._data_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for cam_data in data.get('cameras', []):
                    camera = Camera(**cam_data)
                    self.cameras[camera.id] = camera
            print(f"[INFO] Loaded {len(self.cameras)} cameras")
        except Exception as e:
            print(f"[ERROR] Failed to load cameras: {e}")

    def _save_cameras(self):
        try:
            data = {'cameras': [c.model_dump() for c in self.cameras.values()]}
            with open(self._data_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[ERROR] Failed to save cameras: {e}")

    # =========================================================================
    # Camera CRUD
    # =========================================================================

    async def add_camera(self, camera_data: CameraCreate) -> Camera:
        camera_id = str(uuid.uuid4())
        camera = Camera(id=camera_id, **camera_data.model_dump())
        async with self._lock:
            self.cameras[camera_id] = camera
            self._save_cameras()
        return camera

    async def delete_camera(self, camera_id: str) -> bool:
        async with self._lock:
            if camera_id in self.cameras:
                del self.cameras[camera_id]
                self._save_cameras()
        await self._stop_reader_async(camera_id)
        return True

    async def get_camera(self, camera_id: str) -> Optional[Camera]:
        return self.cameras.get(camera_id)

    async def list_cameras(self) -> list[Camera]:
        return list(self.cameras.values())

    async def update_camera(self, camera_id: str, update_data: CameraUpdate) -> Optional[Camera]:
        needs_restart = False
        camera_enabled = False

        async with self._lock:
            if camera_id not in self.cameras:
                return None
            camera = self.cameras[camera_id]
            update_dict = update_data.model_dump(exclude_unset=True)

            for key, value in update_dict.items():
                if key == 'algorithms' and value is not None:
                    camera.algorithms = [AlgorithmConfig(**algo) for algo in value]
                else:
                    old_value = getattr(camera, key, None)
                    setattr(camera, key, value)
                    if key in ('source', 'type', 'enabled') and value != old_value:
                        needs_restart = True

            camera_enabled = camera.enabled
            self._save_cameras()

        if needs_restart:
            await self._stop_reader_async(camera_id)
            if camera_enabled:
                await self._start_reader_async(camera_id)

        return camera

    async def get_connection_status(self, camera_id: str) -> str:
        reader = self.frame_readers.get(camera_id)
        if reader:
            return reader.status
        return ConnectionStatus.DISCONNECTED

    # =========================================================================
    # Reader lifecycle (all thread-join operations via executor)
    # =========================================================================

    async def _stop_reader_async(self, camera_id: str):
        """Stop and remove a frame reader (non-blocking for event loop)."""
        reader = self.frame_readers.pop(camera_id, None)
        if reader:
            reader.request_stop()
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, reader.join, 2.0)
            print(f"[INFO] Stopped frame reader for camera {camera_id}")

    async def _start_reader_async(self, camera_id: str) -> bool:
        """Start a frame reader. Skips restart if already connected."""
        camera = self.cameras.get(camera_id)
        if not camera or not camera.enabled:
            return False

        existing = self.frame_readers.get(camera_id)
        if existing and existing.status == ConnectionStatus.CONNECTED:
            return True  # already running, nothing to do

        # Stop only if there's a stale/disconnected reader
        if existing:
            await self._stop_reader_async(camera_id)

        reader = FrameReaderThread(camera_id, camera.source, camera.type)
        self.frame_readers[camera_id] = reader
        reader.start()
        return True

    async def start_stream(self, camera_id: str):
        """Explicitly start frame reading for a camera."""
        return await self._start_reader_async(camera_id)

    # =========================================================================
    # Frame Access (non-blocking)
    # =========================================================================

    async def get_frame(self, camera_id: str, timeout: float = 1.0) -> Optional[np.ndarray]:
        """Get the latest frame (non-blocking). Returns None if unavailable."""
        reader = self.frame_readers.get(camera_id)
        if not reader:
            camera = self.cameras.get(camera_id)
            if camera and camera.enabled:
                await self._start_reader_async(camera_id)
                reader = self.frame_readers.get(camera_id)

        if not reader:
            return None

        loop = asyncio.get_running_loop()
        start = time.time()
        while time.time() - start < timeout:
            frame = await loop.run_in_executor(None, reader.get_latest_frame)
            if frame is not None:
                frame = await self._apply_pre_processor(camera_id, frame)
                return frame
            await asyncio.sleep(0.05)

        return None

    # =========================================================================
    # Pre-processors
    # =========================================================================

    def register_pre_processor(self, camera_id: str, processor: Callable[[np.ndarray], np.ndarray]):
        self._pre_processors[camera_id] = processor

    def unregister_processors(self, camera_id: str):
        self._pre_processors.pop(camera_id, None)

    async def _apply_pre_processor(self, camera_id: str, frame: np.ndarray) -> np.ndarray:
        processor = self._pre_processors.get(camera_id)
        if processor:
            try:
                return processor(frame)
            except Exception as e:
                print(f"Pre-processor error for camera {camera_id}: {e}")
        return frame

    # =========================================================================
    # Utilities
    # =========================================================================

    async def get_test_frame(self, camera_id: str) -> np.ndarray:
        height, width = 480, 640
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        frame[:, :] = (30, 40, 50)

        import datetime
        cv2.putText(frame, f"Camera: {camera_id[:8]}...", (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 2)
        cv2.putText(frame, datetime.datetime.now().strftime('%H:%M:%S'), (20, 80),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (150, 150, 150), 1)
        reader = self.frame_readers.get(camera_id)
        status_text = f"Status: {reader.status if reader else 'no reader'}"
        cv2.putText(frame, status_text, (20, 120),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 100, 100), 1)
        return frame

    @staticmethod
    def resize_frame(frame, max_width=640, max_height=480) -> np.ndarray:
        height, width = frame.shape[:2]
        if width > max_width or height > max_height:
            scale = min(max_width / width, max_height / height)
            new_width = int(width * scale)
            new_height = int(height * scale)
            return cv2.resize(frame, (new_width, new_height))
        return frame

    @staticmethod
    def enumerate_devices() -> list[dict]:
        devices = []
        devices.append({
            "id": "http://localhost:9000/stream/localvideo0",
            "name": "Local Video File",
            "type": "rtsp"
        })
        devices.append({
            "id": "http://localhost:9000/stream/webcam0",
            "name": "Local Webcam",
            "type": "rtsp"
        })
        return devices


camera_service = CameraService()