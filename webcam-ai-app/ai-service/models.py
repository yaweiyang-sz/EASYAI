from pydantic import BaseModel
from typing import Optional, Literal
from enum import Enum

class AlgorithmType(str, Enum):
    OBJECT_DETECTION = "object_detection"
    CLASSIFICATION = "classification"

class ProcessRequest(BaseModel):
    camera_id: str
    algorithm: AlgorithmType = AlgorithmType.OBJECT_DETECTION
    confidence: float = 0.5
    model: str = "yolov8n.pt"

class DetectionResult(BaseModel):
    label: str
    confidence: float
    bbox: list[float]

class ClassificationResult(BaseModel):
    label: str
    confidence: float

class ProcessResponse(BaseModel):
    camera_id: str
    algorithm: str
    detections: list[DetectionResult]
    classifications: list[ClassificationResult]
    annotated_frame: Optional[str] = None
    processing_time_ms: float

class AlgorithmInfo(BaseModel):
    id: str
    name: str
    type: AlgorithmType
    description: str
    default_params: dict
