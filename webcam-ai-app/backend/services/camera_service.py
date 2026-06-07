import cv2
import uuid
import asyncio
import base64
import numpy as np
import time
import os
from typing import Dict, Optional
from models import Camera, CameraCreate, CameraUpdate

class VirtualCameraGenerator:
    """虚拟摄像头帧生成器 - 使用静态图片"""
    def __init__(self, camera_name="Virtual Camera", camera_id=None):
        self.camera_name = camera_name
        self.camera_id = camera_id
        self.frame = None
        self.frame_num = 0
        self._load_or_generate_frame()

    def _load_or_generate_frame(self):
        """加载或生成静态帧"""
        # 尝试加载静态图片
        static_images_dir = os.path.join(os.path.dirname(__file__), 'static_images')
        os.makedirs(static_images_dir, exist_ok=True)
        
        # 检查是否有对应的静态图片
        if self.camera_id:
            image_path = os.path.join(static_images_dir, f"{self.camera_id}.jpg")
            if os.path.exists(image_path):
                self.frame = cv2.imread(image_path)
                if self.frame is not None:
                    self.frame = cv2.resize(self.frame, (640, 480))
                    return
        
        # 如果没有静态图片，生成一个简洁的静态帧
        self._generate_static_frame()

    def _generate_static_frame(self):
        """生成简洁的静态帧 - 模拟监控画面"""
        height, width = 480, 640
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        
        # 浅灰蓝色背景 - 模拟监控画面
        frame[:, :] = (30, 40, 50)
        
        # 添加网格线 - 模拟监控场景
        for x in range(0, width, 40):
            cv2.line(frame, (x, 0), (x, height), (40, 50, 60), 1)
        for y in range(0, height, 40):
            cv2.line(frame, (0, y), (width, y), (40, 50, 60), 1)
        
        # 摄像头名称标签背景
        cv2.rectangle(frame, (10, 10), (400, 50), (20, 30, 40), -1)
        cv2.putText(frame, f"{self.camera_name}", (20, 38), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)
        
        # 监控视角指示器 - 简单的几何图形表示监控区域
        center_x, center_y = width // 2, height // 2 + 20
        
        # 绘制监控区域框
        cv2.rectangle(frame, (80, 100), (560, 380), (60, 70, 80), 2)
        
        # 左上角标记
        cv2.line(frame, (80, 100), (80, 130), (60, 140, 200), 3)
        cv2.line(frame, (80, 100), (110, 100), (60, 140, 200), 3)
        
        # 右下角标记
        cv2.line(frame, (560, 380), (560, 350), (60, 140, 200), 3)
        cv2.line(frame, (560, 380), (530, 380), (60, 140, 200), 3)
        
        # 中央图标区域 - 简单的建筑/场景示意
        # 建筑物轮廓
        pts = np.array([[200, 350], [250, 250], [300, 250], [350, 200], [400, 200], [450, 250], [450, 350]], np.int32)
        pts = pts.reshape((-1, 1, 2))
        cv2.polylines(frame, [pts], False, (80, 100, 120), 2)
        
        # 地面线
        cv2.line(frame, (100, 350), (540, 350), (60, 80, 100), 2)
        
        # 小型车辆/物体
        cv2.rectangle(frame, (280, 330), (320, 345), (100, 120, 140), -1)
        cv2.rectangle(frame, (400, 330), (430, 345), (100, 120, 140), -1)
        
        # 底部状态栏
        cv2.rectangle(frame, (0, 430), (640, 480), (15, 25, 35), -1)
        
        # 状态信息
        current_time = time.strftime('%Y-%m-%d %H:%M:%S')
        cv2.putText(frame, "VIRTUAL CAM", (15, 458), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150, 160, 180), 1)
        cv2.putText(frame, f"{current_time}", (400, 458), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150, 160, 180), 1)
        cv2.putText(frame, "● REC", (580, 458), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (100, 200, 100), 1)
        
        self.frame = frame

    def generate_frame(self):
        """生成帧 - 静态图片无需重新生成"""
        return self.frame.copy() if self.frame is not None else None

class CameraService:
    def __init__(self):
        self.cameras: Dict[str, Camera] = {}
        self.streams: Dict[str, cv2.VideoCapture] = {}
        self.virtual_generators: Dict[str, VirtualCameraGenerator] = {}
        self._lock = asyncio.Lock()

    async def add_camera(self, camera_data: CameraCreate) -> Camera:
        camera_id = str(uuid.uuid4())
        camera = Camera(id=camera_id, **camera_data.model_dump())
        async with self._lock:
            self.cameras[camera_id] = camera
            # 为每个摄像头创建虚拟生成器
            self.virtual_generators[camera_id] = VirtualCameraGenerator(camera.name, camera_id)
        return camera

    async def delete_camera(self, camera_id: str) -> bool:
        async with self._lock:
            if camera_id in self.cameras:
                del self.cameras[camera_id]
                if camera_id in self.streams:
                    self.streams[camera_id].release()
                    del self.streams[camera_id]
                if camera_id in self.virtual_generators:
                    del self.virtual_generators[camera_id]
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

    def _is_virtual_camera(self, camera: Camera) -> bool:
        """判断是否是虚拟摄像头"""
        source = str(camera.source).strip()
        # 如果是数字 1-2 或者明确标识为虚拟的
        if source in ["1", "2", "3"]:
            return True
        # 如果名称中包含 "virtual" 或 "虚拟"
        if "virtual" in camera.name.lower() or "虚拟" in camera.name:
            return True
        return False

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

        # 虚拟摄像头直接返回 None，使用虚拟帧
        if self._is_virtual_camera(camera):
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
        if camera_id not in self.virtual_generators:
            camera = self.cameras.get(camera_id)
            name = camera.name if camera else "Unknown Camera"
            self.virtual_generators[camera_id] = VirtualCameraGenerator(name, camera_id)
        return self.virtual_generators[camera_id].generate_frame()

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
    def enumerate_devices(max_check=0) -> list[dict]:
        """
        Enumerate available camera devices (including virtual ones and stream sources)
        Returns list of {'id': index, 'name': 'Camera X', 'type': 'usb'|'integrated'|'rtsp'}
        
        Note: Physical camera check is disabled by default for faster response.
        Set max_check > 0 to enable physical camera detection.
        """
        devices = []
        
        # 添加虚拟摄像头（始终可用，快速响应）
        devices.append({
            "id": "1",
            "name": "虚拟摄像头 1 - 大厅监控",
            "type": "integrated",
            "resolution": "640x480",
            "fps": "15.0"
        })
        devices.append({
            "id": "2",
            "name": "虚拟摄像头 2 - 走廊监控",
            "type": "usb",
            "resolution": "640x480",
            "fps": "15.0"
        })
        
        # 添加 MJPEG 流源（如果服务器运行）
        mjpeg_stream_url = "http://localhost:9000/stream"
        devices.append({
            "id": mjpeg_stream_url,
            "name": "MJPEG 视频流服务器",
            "type": "rtsp",
            "resolution": "640x480",
            "fps": "15.0"
        })
        
        # 添加虚拟摄像头服务器流
        devices.append({
            "id": "http://localhost:9000/stream/1",
            "name": "虚拟摄像头流 1 - 大厅",
            "type": "rtsp",
            "resolution": "640x480",
            "fps": "15.0"
        })
        devices.append({
            "id": "http://localhost:9000/stream/2",
            "name": "虚拟摄像头流 2 - 走廊",
            "type": "rtsp",
            "resolution": "640x480",
            "fps": "15.0"
        })
        
        # 物理摄像头检查（默认禁用，可通过 max_check 参数启用）
        if max_check > 0:
            for i in range(max_check):
                try:
                    cap = cv2.VideoCapture(i)
                    if cap.isOpened():
                        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                        fps = cap.get(cv2.CAP_PROP_FPS)
                        
                        device_type = "integrated" if i == 0 else "usb"
                        name = f"物理摄像头 {i}"
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
                    continue
        
        return devices

camera_service = CameraService()
