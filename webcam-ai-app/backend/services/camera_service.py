"""
Camera Service Module
Core functionality for camera stream management with algorithm integration support.
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
from typing import Dict, Optional, Callable, Any, Literal
from models import Camera, CameraCreate, CameraUpdate, AlgorithmConfig


class ConnectionStatus:
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"


class StreamContext:
    """Context for managing stream lifecycle and state"""
    
    def __init__(self):
        self.stream: Optional[cv2.VideoCapture] = None
        self.status = ConnectionStatus.DISCONNECTED
        self.last_connected_at: Optional[float] = None
        self.last_frame_at: Optional[float] = None
        self.retry_count = 0
        self.last_retry_at: Optional[float] = None
        self.lock = threading.Lock()
        self.thread: Optional[threading.Thread] = None
        self.stop_event = threading.Event()
        self.ready_event = threading.Event()


class HttpMjpegReader:
    """Direct HTTP MJPEG stream reader that mimics cv2.VideoCapture interface"""
    
    def __init__(self, url, response):
        self.url = url
        self.response = response
        self.stream = response.iter_content(chunk_size=4096)
        self.boundary = b'--frame'
        self.buffer = b''
        self._opened = True
    
    def isOpened(self):
        return self._opened and self.response is not None
    
    def read(self):
        """Read a frame from the MJPEG stream"""
        try:
            while self._opened:
                chunk = next(self.stream, None)
                if chunk is None:
                    return False, None
                
                self.buffer += chunk
                
                parts = self.buffer.split(self.boundary)
                if len(parts) >= 2:
                    frame_data = parts[0]
                    self.buffer = self.boundary.join(parts[1:])
                    
                    header_end = frame_data.find(b'\r\n\r\n')
                    if header_end != -1:
                        image_data = frame_data[header_end + 4:]
                        if len(image_data) > 0:
                            try:
                                img_array = np.asarray(bytearray(image_data), dtype=np.uint8)
                                frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
                                if frame is not None:
                                    return True, frame
                            except Exception as e:
                                print(f"[DEBUG] Failed to decode frame: {e}")
            return False, None
        except Exception as e:
            print(f"[ERROR] HTTP MJPEG read error: {e}")
            return False, None
    
    def release(self):
        """Release resources"""
        self._opened = False
        if self.response:
            try:
                self.response.close()
            except:
                pass
    
    def set(self, prop, value):
        """Set property (dummy for compatibility)"""
        pass
    
    def get(self, prop):
        """Get property (dummy for compatibility)"""
        return 0


class CameraService:
    """Camera service for stream management and algorithm integration"""
    
    def __init__(self):
        self.cameras: Dict[str, Camera] = {}
        self.stream_contexts: Dict[str, StreamContext] = {}
        self._lock = asyncio.Lock()
        
        self._pre_processors: Dict[str, Callable] = {}
        self._post_processors: Dict[str, Callable] = {}
        
        self._data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
        self._data_file = os.path.join(self._data_dir, 'cameras.json')
        
        os.makedirs(self._data_dir, exist_ok=True)
        
        self._load_cameras()

    def _get_retry_delay(self, retry_count: int) -> float:
        """Calculate exponential backoff delay for retries"""
        base_delay = 1.0
        max_delay = 30.0
        delay = min(base_delay * (2 ** retry_count), max_delay)
        return delay + np.random.uniform(0, 0.5)

    def _connect_stream_worker(self, camera_id: str, camera: Camera):
        """Background worker for stream connection"""
        context = self.stream_contexts.get(camera_id)
        if not context:
            return
        
        while not context.stop_event.is_set():
            try:
                if context.status == ConnectionStatus.DISCONNECTED:
                    context.status = ConnectionStatus.CONNECTING
                
                stream = self._open_stream(camera)
                
                if stream:
                    with context.lock:
                        context.stream = stream
                        context.status = ConnectionStatus.CONNECTED
                        context.last_connected_at = time.time()
                        context.retry_count = 0
                        context.ready_event.set()
                    break
                else:
                    context.status = ConnectionStatus.RECONNECTING
                    context.retry_count += 1
                    delay = self._get_retry_delay(context.retry_count)
                    print(f"[INFO] Camera {camera_id} connection failed, retrying in {delay:.1f}s (attempt {context.retry_count})")
                    context.stop_event.wait(delay)
                    
            except Exception as e:
                print(f"[ERROR] Connection worker error for camera {camera_id}: {e}")
                context.status = ConnectionStatus.RECONNECTING
                context.retry_count += 1
                delay = self._get_retry_delay(context.retry_count)
                context.stop_event.wait(delay)

    def _open_stream(self, camera: Camera) -> Optional[cv2.VideoCapture]:
        """Open camera stream from source with timeout"""
        source = camera.source
        print(f"[INFO] Trying to open stream: {source}")
        
        try:
            if camera.type in ["usb", "integrated"]:
                if isinstance(source, str) and source.isdigit():
                    source = int(source)
            
            if isinstance(source, str) and (source.startswith('http://') or source.startswith('https://')):
                return self._open_http_stream(source)
            elif isinstance(source, str) and source.startswith('rtsp'):
                cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
                cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
                cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 2000)
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    return cap
                else:
                    print(f"[WARN] Failed to open RTSP stream: {source}")
            else:
                cap = cv2.VideoCapture(source)
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    return cap
                else:
                    print(f"[WARN] Failed to open local stream: {source}")
        except Exception as e:
            print(f"[ERROR] Error opening stream for camera {camera.id}: {e}")
        return None

    def _open_http_stream(self, url: str) -> Optional[cv2.VideoCapture]:
        """Open HTTP MJPEG stream with multiple backend attempts"""
        backends = [
            cv2.CAP_FFMPEG,
            cv2.CAP_ANY,
        ]
        
        for backend in backends:
            try:
                cap = cv2.VideoCapture(url, backend)
                cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
                cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 2000)
                
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    print(f"[OK] Opened HTTP stream with backend {backend}")
                    return cap
                else:
                    cap.release()
            except Exception as e:
                print(f"[DEBUG] Backend {backend} failed: {e}")
        
        print(f"[WARN] All backends failed for HTTP stream: {url}")
        print(f"[INFO] Trying direct HTTP MJPEG reader...")
        
        http_reader = self._create_http_mjpeg_reader(url)
        if http_reader:
            return http_reader
        
        return None

    def _create_http_mjpeg_reader(self, url: str):
        """Create a direct HTTP MJPEG stream reader"""
        try:
            import requests
            from io import BytesIO
            
            response = requests.get(url, stream=True, timeout=5)
            if response.status_code == 200:
                print(f"[OK] Created HTTP MJPEG reader for {url}")
                return HttpMjpegReader(url, response)
            else:
                print(f"[WARN] HTTP request failed with status {response.status_code}")
        except Exception as e:
            print(f"[ERROR] Failed to create HTTP MJPEG reader: {e}")
        return None

    def _health_check_worker(self, camera_id: str):
        """Background worker for stream health monitoring"""
        context = self.stream_contexts.get(camera_id)
        if not context:
            return
        
        while not context.stop_event.is_set():
            if context.status == ConnectionStatus.CONNECTED:
                try:
                    with context.lock:
                        if context.stream and context.stream.isOpened():
                            ret = context.stream.grab()
                            if not ret:
                                print(f"[WARN] Stream {camera_id} health check failed, initiating reconnect")
                                self._schedule_reconnect(camera_id)
                        else:
                            self._schedule_reconnect(camera_id)
                except Exception as e:
                    print(f"[ERROR] Health check error for camera {camera_id}: {e}")
                    self._schedule_reconnect(camera_id)
            
            context.stop_event.wait(2.0)

    def _schedule_reconnect(self, camera_id: str):
        """Schedule a reconnect for a disconnected stream"""
        context = self.stream_contexts.get(camera_id)
        if not context:
            return
        
        with context.lock:
            if context.stream:
                try:
                    context.stream.release()
                except:
                    pass
                context.stream = None
            
            context.status = ConnectionStatus.DISCONNECTED
            context.ready_event.clear()
        
        if context.thread and context.thread.is_alive():
            context.stop_event.set()
            context.thread.join(timeout=2.0)
        
        context.stop_event.clear()
        context.thread = threading.Thread(
            target=self._connect_stream_worker,
            args=(camera_id, self.cameras.get(camera_id)),
            daemon=True
        )
        context.thread.start()

    # =========================================================================
    # Persistence Methods
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
                    self.stream_contexts[camera.id] = StreamContext()
            print(f"[INFO] Loaded {len(self.cameras)} cameras from {self._data_file}")
        except Exception as e:
            print(f"[ERROR] Failed to load cameras: {e}")
    
    def _save_cameras(self):
        try:
            data = {
                'cameras': [
                    camera.model_dump() for camera in self.cameras.values()
                ]
            }
            with open(self._data_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[ERROR] Failed to save cameras: {e}")
    
    # =========================================================================
    # Camera Management
    # =========================================================================
    
    async def add_camera(self, camera_data: CameraCreate) -> Camera:
        camera_id = str(uuid.uuid4())
        camera = Camera(id=camera_id, **camera_data.model_dump())
        async with self._lock:
            self.cameras[camera_id] = camera
            self.stream_contexts[camera_id] = StreamContext()
            self._save_cameras()
        return camera
    
    async def delete_camera(self, camera_id: str) -> bool:
        async with self._lock:
            if camera_id in self.cameras:
                self._stop_stream(camera_id)
                del self.cameras[camera_id]
                del self.stream_contexts[camera_id]
                self._save_cameras()
                return True
        return False
    
    def _stop_stream(self, camera_id: str):
        context = self.stream_contexts.get(camera_id)
        if context:
            context.stop_event.set()
            if context.thread and context.thread.is_alive():
                context.thread.join(timeout=3.0)
            with context.lock:
                if context.stream:
                    try:
                        context.stream.release()
                    except:
                        pass
                    context.stream = None
    
    async def get_camera(self, camera_id: str) -> Optional[Camera]:
        return self.cameras.get(camera_id)
    
    async def list_cameras(self) -> list[Camera]:
        return list(self.cameras.values())
    
    async def update_camera(self, camera_id: str, update_data: CameraUpdate) -> Optional[Camera]:
        async with self._lock:
            if camera_id not in self.cameras:
                return None
            camera = self.cameras[camera_id]
            update_dict = update_data.model_dump(exclude_unset=True)
            
            needs_reconnect = False
            old_source = camera.source
            
            for key, value in update_dict.items():
                if key == 'algorithms' and value is not None:
                    camera.algorithms = [AlgorithmConfig(**algo) for algo in value]
                else:
                    setattr(camera, key, value)
                    if key == 'source' and value != old_source:
                        needs_reconnect = True
            
            if needs_reconnect and camera.enabled:
                self._schedule_reconnect(camera_id)
            
            self._save_cameras()
            return camera
    
    async def get_connection_status(self, camera_id: str) -> str:
        """Get current connection status of a camera"""
        context = self.stream_contexts.get(camera_id)
        if context:
            return context.status
        return ConnectionStatus.DISCONNECTED
    
    # =========================================================================
    # Stream Management
    # =========================================================================
    
    async def get_stream(self, camera_id: str, timeout: float = 2.0) -> Optional[cv2.VideoCapture]:
        """Get or create stream for camera with timeout"""
        camera = self.cameras.get(camera_id)
        if not camera or not camera.enabled:
            return None
        
        context = self.stream_contexts.get(camera_id)
        if not context:
            return None
        
        if context.status == ConnectionStatus.DISCONNECTED:
            self._schedule_reconnect(camera_id)
        
        try:
            if not context.ready_event.wait(timeout=timeout):
                print(f"[WARN] Stream {camera_id} not ready within {timeout}s timeout")
                return None
        except Exception:
            return None
        
        with context.lock:
            if context.stream and context.stream.isOpened():
                return context.stream
        
        return None
    
    async def release_stream(self, camera_id: str):
        async with self._lock:
            self._stop_stream(camera_id)
            context = self.stream_contexts.get(camera_id)
            if context:
                context.status = ConnectionStatus.DISCONNECTED
                context.ready_event.clear()
    
    async def start_stream(self, camera_id: str):
        """Explicitly start stream for a camera"""
        camera = self.cameras.get(camera_id)
        if not camera or not camera.enabled:
            return False
        
        context = self.stream_contexts.get(camera_id)
        if not context:
            return False
        
        if context.status == ConnectionStatus.CONNECTED:
            return True
        
        if context.thread and context.thread.is_alive():
            context.stop_event.set()
            context.thread.join(timeout=2.0)
        
        context.stop_event.clear()
        context.thread = threading.Thread(
            target=self._connect_stream_worker,
            args=(camera_id, camera),
            daemon=True
        )
        context.thread.start()
        
        health_thread = threading.Thread(
            target=self._health_check_worker,
            args=(camera_id,),
            daemon=True
        )
        health_thread.start()
        
        return True
    
    # =========================================================================
    # Frame Processing & Algorithm Integration
    # =========================================================================
    
    async def get_frame(self, camera_id: str, timeout: float = 1.0) -> Optional[np.ndarray]:
        """Get single frame from camera with timeout protection"""
        stream = await self.get_stream(camera_id, timeout=timeout)
        if not stream:
            return None
        
        try:
            ret, frame = stream.read()
            if not ret:
                print(f"[WARN] Failed to read frame from camera {camera_id}")
                self._schedule_reconnect(camera_id)
                return None
            
            context = self.stream_contexts.get(camera_id)
            if context:
                context.last_frame_at = time.time()
            
            frame = await self._apply_pre_processor(camera_id, frame)
            return frame
        
        except Exception as e:
            print(f"[ERROR] Error reading frame from camera {camera_id}: {e}")
            self._schedule_reconnect(camera_id)
            return None
    
    async def get_frames_batch(self, camera_ids: list[str]) -> Dict[str, Optional[np.ndarray]]:
        """Get frames from multiple cameras concurrently"""
        tasks = [self.get_frame(camera_id) for camera_id in camera_ids]
        results = await asyncio.gather(*tasks)
        return dict(zip(camera_ids, results))
    
    # =========================================================================
    # Algorithm Integration Hooks
    # =========================================================================
    
    def register_pre_processor(self, camera_id: str, processor: Callable[[np.ndarray], np.ndarray]):
        self._pre_processors[camera_id] = processor
    
    def register_post_processor(self, camera_id: str, processor: Callable[[np.ndarray], Any]):
        self._post_processors[camera_id] = processor
    
    def unregister_processors(self, camera_id: str):
        self._pre_processors.pop(camera_id, None)
        self._post_processors.pop(camera_id, None)
    
    async def _apply_pre_processor(self, camera_id: str, frame: np.ndarray) -> np.ndarray:
        processor = self._pre_processors.get(camera_id)
        if processor:
            try:
                return processor(frame)
            except Exception as e:
                print(f"Pre-processor error for camera {camera_id}: {e}")
        return frame
    
    async def _apply_post_processor(self, camera_id: str, frame: np.ndarray) -> Any:
        processor = self._post_processors.get(camera_id)
        if processor:
            try:
                return processor(frame)
            except Exception as e:
                print(f"Post-processor error for camera {camera_id}: {e}")
        return frame
    
    # =========================================================================
    # Utility Functions
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
        
        context = self.stream_contexts.get(camera_id)
        if context:
            status_text = f"Status: {context.status}"
            cv2.putText(frame, status_text, (20, 120), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 100, 100), 1)
            if context.retry_count > 0:
                retry_text = f"Retries: {context.retry_count}"
                cv2.putText(frame, retry_text, (20, 145), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 200, 100), 1)
        
        return frame
    
    @staticmethod
    def frame_to_base64(frame) -> Optional[str]:
        if frame is None:
            return None
        try:
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            return base64.b64encode(buffer).decode('utf-8')
        except Exception:
            return None
    
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