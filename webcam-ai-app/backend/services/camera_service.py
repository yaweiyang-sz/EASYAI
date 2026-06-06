import cv2
import uuid
import asyncio
import base64
import numpy as np
import time
from typing import Dict, Optional
from models import Camera, CameraCreate, CameraUpdate

class TestFrameGenerator:
    def __init__(self):
        self.frame_num = 0

    def generate_frame(self):
        height, width = 480, 640
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        
        cv2.putText(frame, "Camera AI Dashboard", (50, 50), 
                    cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 255, 0), 3)
        cv2.putText(frame, f"Frame: {self.frame_num}", (50, 100), 
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        cv2.putText(frame, f"Time: {time.strftime('%H:%M:%S')}", (50, 140), 
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        
        center_x, center_y = width // 2, height // 2
        radius = int(50 + 30 * np.sin(self.frame_num * 0.1))
        color = (0, 0, 255) if self.frame_num % 2 == 0 else (0, 255, 255)
        cv2.circle(frame, (center_x, center_y), radius, color, -1)
        
        for i in range(4):
            angle = (self.frame_num * 0.05) + (i * np.pi / 2)
            x = int(center_x + 150 * np.cos(angle))
            y = int(center_y + 100 * np.sin(angle))
            cv2.circle(frame, (x, y), 15, (255, 0, 0), -1)
        
        self.frame_num += 1
        return frame

class CameraService:
    def __init__(self):
        self.cameras: Dict[str, Camera] = {}
        self.streams: Dict[str, cv2.VideoCapture] = {}
        self.test_generators: Dict[str, TestFrameGenerator] = {}
        self._lock = asyncio.Lock()

    async def add_camera(self, camera_data: CameraCreate) -> Camera:
        camera_id = str(uuid.uuid4())
        camera = Camera(id=camera_id, **camera_data.model_dump())
        async with self._lock:
            self.cameras[camera_id] = camera
            self.test_generators[camera_id] = TestFrameGenerator()
        return camera

    async def delete_camera(self, camera_id: str) -> bool:
        async with self._lock:
            if camera_id in self.cameras:
                del self.cameras[camera_id]
                if camera_id in self.streams:
                    self.streams[camera_id].release()
                    del self.streams[camera_id]
                if camera_id in self.test_generators:
                    del self.test_generators[camera_id]
                return True
        return False

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
            for key, value in update_dict.items():
                setattr(camera, key, value)
            return camera

    def _open_stream(self, camera: Camera) -> Optional[cv2.VideoCapture]:
        try:
            if camera.type == "usb" or camera.type == "integrated":
                source = int(camera.source) if camera.source.isdigit() else camera.source
            else:
                source = camera.source

            cap = cv2.VideoCapture(source)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                return cap
        except Exception as e:
            print(f"Error opening stream for camera {camera.id}: {e}")
        return None

    async def get_stream(self, camera_id: str) -> Optional[cv2.VideoCapture]:
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
        async with self._lock:
            if camera_id in self.streams:
                self.streams[camera_id].release()
                del self.streams[camera_id]

    async def get_test_frame(self, camera_id: str) -> np.ndarray:
        if camera_id not in self.test_generators:
            self.test_generators[camera_id] = TestFrameGenerator()
        return self.test_generators[camera_id].generate_frame()

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
    def enumerate_devices(max_check=10) -> list[dict]:
        """
        Enumerate available camera devices
        Returns list of {'id': index, 'name': 'Camera X', 'type': 'usb'|'integrated'}
        """
        devices = []
        
        for i in range(max_check):
            try:
                cap = cv2.VideoCapture(i)
                if cap.isOpened():
                    # Try to get some device info
                    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    fps = cap.get(cv2.CAP_PROP_FPS)
                    
                    device_type = "integrated" if i == 0 else "usb"
                    name = f"Camera {i}"
                    if width > 0 and height > 0:
                        name += f" ({width}x{height})"
                    
                    devices.append({
                        "id": str(i),
                        "name": name,
                        "type": device_type,
                        "resolution": f"{width}x{height}" if width > 0 else "Unknown",
                        "fps": f"{fps:.1f}" if fps > 0 else "Unknown"
                    })
                    cap.release()
            except Exception as e:
                print(f"Error checking device {i}: {e}")
                continue
        
        return devices

camera_service = CameraService()
