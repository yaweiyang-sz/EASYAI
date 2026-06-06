from pydantic import BaseModel
from typing import Optional, Literal

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

class Camera(CameraBase):
    id: str

    class Config:
        from_attributes = True

class AlgorithmConfig(BaseModel):
    algorithm_id: str
    enabled: bool = True
    params: dict = {}

class StreamFrame(BaseModel):
    frame: str
    timestamp: float
    camera_id: str
    detected_objects: Optional[list] = None
    classifications: Optional[list] = None
