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
from typing import Dict, Optional, Callable, Any
from models import Camera, CameraCreate, CameraUpdate


class CameraService:
    """Camera service for stream management and algorithm integration"""
    
    def __init__(self):
        self.cameras: Dict[str, Camera] = {}
        self.streams: Dict[str, cv2.VideoCapture] = {}
        self._lock = asyncio.Lock()
        
        # Algorithm integration hooks (reserved for future use)
        self._pre_processors: Dict[str, Callable] = {}
        self._post_processors: Dict[str, Callable] = {}
        
        # JSON file persistence
        self._data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
        self._data_file = os.path.join(self._data_dir, 'cameras.json')
        
        # Ensure data directory exists
        os.makedirs(self._data_dir, exist_ok=True)
        
        # Load cameras from file on startup
        self._load_cameras()
    
    # =========================================================================
    # Persistence Methods
    # =========================================================================
    
    def _load_cameras(self):
        """Load cameras from JSON file"""
        if not os.path.exists(self._data_file):
            return
        
        try:
            with open(self._data_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for cam_data in data.get('cameras', []):
                    camera = Camera(**cam_data)
                    self.cameras[camera.id] = camera
            print(f"[INFO] Loaded {len(self.cameras)} cameras from {self._data_file}")
        except Exception as e:
            print(f"[ERROR] Failed to load cameras: {e}")
    
    def _save_cameras(self):
        """Save cameras to JSON file"""
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
        """Add a new camera"""
        camera_id = str(uuid.uuid4())
        camera = Camera(id=camera_id, **camera_data.model_dump())
        async with self._lock:
            self.cameras[camera_id] = camera
            self._save_cameras()
        return camera
    
    async def delete_camera(self, camera_id: str) -> bool:
        """Delete a camera"""
        async with self._lock:
            if camera_id in self.cameras:
                del self.cameras[camera_id]
                if camera_id in self.streams:
                    self.streams[camera_id].release()
                    del self.streams[camera_id]
                self._save_cameras()
                return True
        return False
    
    async def get_camera(self, camera_id: str) -> Optional[Camera]:
        """Get camera by ID"""
        return self.cameras.get(camera_id)
    
    async def list_cameras(self) -> list[Camera]:
        """List all cameras"""
        return list(self.cameras.values())
    
    async def update_camera(self, camera_id: str, update_data: CameraUpdate) -> Optional[Camera]:
        """Update camera settings"""
        async with self._lock:
            if camera_id not in self.cameras:
                return None
            camera = self.cameras[camera_id]
            update_dict = update_data.model_dump(exclude_unset=True)
            for key, value in update_dict.items():
                setattr(camera, key, value)
            self._save_cameras()
            return camera
    
    # =========================================================================
    # Stream Management
    # =========================================================================
    
    def _open_stream(self, camera: Camera) -> Optional[cv2.VideoCapture]:
        """Open camera stream from source"""
        try:
            source = camera.source
            
            # Handle different source types
            if camera.type in ["usb", "integrated"]:
                # Physical camera - use device index or path
                if isinstance(source, str) and source.isdigit():
                    source = int(source)
            
            # Set FFmpeg timeout for network streams (in microseconds)
            if isinstance(source, str) and source.startswith('http'):
                os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'timeout;5000000'
            
            cap = cv2.VideoCapture(source)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                return cap
            else:
                print(f"[WARN] Failed to open stream: {source}")
        except Exception as e:
            print(f"Error opening stream for camera {camera.id}: {e}")
        return None
    
    async def get_stream(self, camera_id: str) -> Optional[cv2.VideoCapture]:
        """Get or create stream for camera"""
        camera = self.cameras.get(camera_id)
        if not camera or not camera.enabled:
            return None
        
        async with self._lock:
            if camera_id not in self.streams or not self.streams[camera_id].isOpened():
                stream = self._open_stream(camera)
                if stream:
                    self.streams[camera_id] = stream
                return stream
            return self.streams[camera_id]
    
    async def release_stream(self, camera_id: str):
        """Release stream for camera"""
        async with self._lock:
            if camera_id in self.streams:
                self.streams[camera_id].release()
                del self.streams[camera_id]
    
    # =========================================================================
    # Frame Processing & Algorithm Integration
    # =========================================================================
    
    async def get_frame(self, camera_id: str) -> Optional[np.ndarray]:
        """Get single frame from camera (with algorithm hooks)"""
        stream = await self.get_stream(camera_id)
        if not stream:
            return None
        
        ret, frame = stream.read()
        if not ret:
            return None
        
        # Apply pre-processor if registered
        frame = await self._apply_pre_processor(camera_id, frame)
        
        return frame
    
    async def get_frames_batch(self, camera_ids: list[str]) -> Dict[str, Optional[np.ndarray]]:
        """Get frames from multiple cameras"""
        results = {}
        for camera_id in camera_ids:
            results[camera_id] = await self.get_frame(camera_id)
        return results
    
    # =========================================================================
    # Algorithm Integration Hooks (Reserved Interface)
    # =========================================================================
    
    def register_pre_processor(self, camera_id: str, processor: Callable[[np.ndarray], np.ndarray]):
        """
        Register a pre-processor function for a camera.
        The function will be called with each frame before returning.
        
        Args:
            camera_id: Camera identifier
            processor: Function that takes a frame (numpy array) and returns processed frame
        """
        self._pre_processors[camera_id] = processor
    
    def register_post_processor(self, camera_id: str, processor: Callable[[np.ndarray], Any]):
        """
        Register a post-processor function for a camera.
        The function will be called with each frame after processing.
        
        Args:
            camera_id: Camera identifier
            processor: Function that takes a frame and returns any result
        """
        self._post_processors[camera_id] = processor
    
    def unregister_processors(self, camera_id: str):
        """Unregister all processors for a camera"""
        self._pre_processors.pop(camera_id, None)
        self._post_processors.pop(camera_id, None)
    
    async def _apply_pre_processor(self, camera_id: str, frame: np.ndarray) -> np.ndarray:
        """Apply registered pre-processor to frame"""
        processor = self._pre_processors.get(camera_id)
        if processor:
            try:
                return processor(frame)
            except Exception as e:
                print(f"Pre-processor error for camera {camera_id}: {e}")
        return frame
    
    async def _apply_post_processor(self, camera_id: str, frame: np.ndarray) -> Any:
        """Apply registered post-processor to frame"""
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
        """Generate a simple test frame when stream is not available"""
        height, width = 480, 640
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        frame[:, :] = (30, 40, 50)
        
        # Add camera ID
        import datetime
        cv2.putText(frame, f"Camera: {camera_id[:8]}...", (20, 40), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 2)
        cv2.putText(frame, datetime.datetime.now().strftime('%H:%M:%S'), (20, 80), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (150, 150, 150), 1)
        
        return frame
    
    @staticmethod
    def frame_to_base64(frame) -> Optional[str]:
        """Convert frame to base64 string"""
        if frame is None:
            return None
        try:
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            return base64.b64encode(buffer).decode('utf-8')
        except Exception:
            return None
    
    @staticmethod
    def resize_frame(frame, max_width=640, max_height=480) -> np.ndarray:
        """Resize frame to fit within max dimensions"""
        height, width = frame.shape[:2]
        if width > max_width or height > max_height:
            scale = min(max_width / width, max_height / height)
            new_width = int(width * scale)
            new_height = int(height * scale)
            return cv2.resize(frame, (new_width, new_height))
        return frame
    
    @staticmethod
    def enumerate_devices() -> list[dict]:
        """
        Enumerate available camera devices.
        Returns list of device info dicts.
        """
        devices = []
        
        # Add stream sources from local camera server
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
        
        # Physical camera detection (optional, may be slow)
        # Uncomment if needed:
        # for i in range(5):
        #     try:
        #         cap = cv2.VideoCapture(i)
        #         if cap.isOpened():
        #             width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        #             height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        #             devices.append({
        #                 "id": str(i),
        #                 "name": f"Camera {i} ({width}x{height})",
        #                 "type": "usb"
        #             })
        #             cap.release()
        #     except:
        #         continue
        
        return devices


# Global service instance
camera_service = CameraService()