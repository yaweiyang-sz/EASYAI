import time
import base64
import numpy as np
from typing import Optional
from ultralytics import YOLO
from PIL import Image
from io import BytesIO

class YOLODetector:
    def __init__(self, model_name: str = "yolov8n.pt"):
        self.model = YOLO(model_name)
        self.class_names = self.model.names

    def detect(self, frame: np.ndarray, confidence: float = 0.5) -> tuple[list, list]:
        results = self.model(frame, conf=confidence, verbose=False)
        detections = []
        annotated_frame = None

        if len(results) > 0:
            result = results[0]
            boxes = result.boxes

            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                conf = float(box.conf[0])
                cls = int(box.cls[0])
                label = self.class_names[cls]

                detections.append({
                    "label": label,
                    "confidence": conf,
                    "bbox": [float(x1), float(y1), float(x2), float(y2)]
                })

            annotated = result.plot()
            img = Image.fromarray(annotated[..., ::-1])
            buffer = BytesIO()
            img.save(buffer, format='JPEG')
            annotated_frame = base64.b64encode(buffer.getvalue()).decode('utf-8')

        return detections, annotated_frame

    def get_available_classes(self) -> list[str]:
        return list(self.class_names.values())
