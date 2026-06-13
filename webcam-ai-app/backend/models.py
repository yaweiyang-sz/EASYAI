from pydantic import BaseModel
from typing import Optional, Literal, List

class ROI(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int

class AlgorithmConfig(BaseModel):
    id: str
    name: str
    algorithm_type: Literal["object_detection", "classification"]
    enabled: bool = True
    confidence: float = 0.5
    roi: Optional[ROI] = None
    classes: List[str] = []

class CameraBase(BaseModel):
    name: str
    source: str
    type: Literal["rtsp", "usb", "integrated"]
    enabled: bool = True

class CameraCreate(CameraBase):
    pass

class CameraUpdate(BaseModel):
    name: Optional[str] = None
    source: Optional[str] = None
    type: Optional[Literal["rtsp", "usb", "integrated"]] = None
    enabled: Optional[bool] = None
    algorithms: Optional[List[AlgorithmConfig]] = None

class Camera(CameraBase):
    id: str
    algorithms: List[AlgorithmConfig] = []

class StreamFrame(BaseModel):
    frame: str
    timestamp: float
    camera_id: str
    detected_objects: Optional[list] = None
    classifications: Optional[list] = None