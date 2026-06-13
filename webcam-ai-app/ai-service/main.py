from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import time
import numpy as np
from io import BytesIO
from typing import Optional
from PIL import Image

from models import (
    AlgorithmType, ProcessResponse, AlgorithmInfo,
    DetectionResult, ClassificationResult
)
from detector import YOLODetector
from classifier import YOLOClassifier

detector: Optional[YOLODetector] = None
classifier: Optional[YOLOClassifier] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global detector, classifier
    print("Loading YOLO models...")
    detector = YOLODetector("yolov8n.pt")
    classifier = YOLOClassifier("yolov8n-cls.pt")
    print("Models loaded successfully")
    yield
    print("Shutting down...")

app = FastAPI(
    title="AI Processing Service",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALGORITHMS = {
    "object_detection": AlgorithmInfo(
        id="object_detection",
        name="YOLO Object Detection",
        type=AlgorithmType.OBJECT_DETECTION,
        description="Detect objects in images using YOLOv8",
        default_params={"confidence": 0.5, "model": "yolov8n.pt"}
    ),
    "classification": AlgorithmInfo(
        id="classification",
        name="YOLO Image Classification",
        type=AlgorithmType.CLASSIFICATION,
        description="Classify images using YOLOv8",
        default_params={"top_k": 5, "model": "yolov8n-cls.pt"}
    )
}

@app.get("/api/algorithms", response_model=list[AlgorithmInfo])
async def list_algorithms():
    return list(ALGORITHMS.values())

@app.get("/api/algorithms/{algorithm_id}", response_model=AlgorithmInfo)
async def get_algorithm(algorithm_id: str):
    if algorithm_id not in ALGORITHMS:
        raise HTTPException(status_code=404, detail="Algorithm not found")
    return ALGORITHMS[algorithm_id]

@app.post("/api/process")
async def process_image(
    image: UploadFile = File(...),
    camera_id: str = Query(...),
    algorithm: AlgorithmType = Query(AlgorithmType.OBJECT_DETECTION),
    confidence: float = Query(0.5, ge=0.0, le=1.0),
    roi_x1: Optional[float] = Query(None),
    roi_y1: Optional[float] = Query(None),
    roi_x2: Optional[float] = Query(None),
    roi_y2: Optional[float] = Query(None),
    classes: Optional[str] = Query(None)
):
    if not image.content_type or not image.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")

    start_time = time.time()

    contents = await image.read()
    
    try:
        img = Image.open(BytesIO(contents)).convert("RGB")
        frame = np.array(img)
        frame = frame[:, :, ::-1]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode image: {str(e)}")

    # Parse classes filter
    class_filter = None
    if classes:
        class_filter = [c.strip() for c in classes.split(',')]

    # Parse ROI
    roi = None
    if all(v is not None for v in [roi_x1, roi_y1, roi_x2, roi_y2]):
        roi = [roi_x1, roi_y1, roi_x2, roi_y2]

    detections = []
    classifications = []
    annotated_frame = None

    if algorithm == AlgorithmType.OBJECT_DETECTION:
        detections, annotated_frame = detector.detect(frame, confidence, roi, class_filter)
    elif algorithm == AlgorithmType.CLASSIFICATION:
        classifications, annotated_frame = classifier.classify(frame)

    processing_time = (time.time() - start_time) * 1000

    return ProcessResponse(
        camera_id=camera_id,
        algorithm=algorithm.value,
        detections=[DetectionResult(**d) for d in detections],
        classifications=[ClassificationResult(**c) for c in classifications],
        annotated_frame=annotated_frame,
        processing_time_ms=processing_time
    )

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "ai-processing",
        "models_loaded": detector is not None and classifier is not None
    }

@app.get("/api/classes/{algorithm}")
async def get_classes(algorithm: AlgorithmType):
    if algorithm == AlgorithmType.OBJECT_DETECTION:
        return {"classes": detector.get_available_classes()}
    elif algorithm == AlgorithmType.CLASSIFICATION:
        return {"classes": classifier.get_available_classes()}
    raise HTTPException(status_code=404, detail="Algorithm not found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
