import cv2
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

    def detect(self, frame: np.ndarray, confidence: float = 0.5, roi: Optional[list] = None, class_filter: Optional[list] = None) -> tuple[list, list]:
        # Apply ROI if provided
        if roi:
            x1, y1, x2, y2 = [int(v) for v in roi]
            x1 = max(0, x1)
            y1 = max(0, y1)
            x2 = min(frame.shape[1], x2)
            y2 = min(frame.shape[0], y2)
            roi_frame = frame[y1:y2, x1:x2]
        else:
            roi_frame = frame
            x1 = y1 = 0

        results = self.model(roi_frame, conf=confidence, verbose=False)
        detections = []
        annotated_frame = None

        if len(results) > 0:
            result = results[0]
            boxes = result.boxes

            for box in boxes:
                conf = float(box.conf[0])
                cls = int(box.cls[0])
                label = self.class_names[cls]

                # Apply class filter
                if class_filter and label not in class_filter:
                    continue

                # Adjust bbox coordinates if ROI was applied
                bx1, by1, bx2, by2 = box.xyxy[0].cpu().numpy()
                detections.append({
                    "label": label,
                    "confidence": conf,
                    "bbox": [float(bx1 + x1), float(by1 + y1), float(bx2 + x1), float(by2 + y1)]
                })

            annotated = result.plot()
            
            # If ROI was applied, draw ROI box on original frame
            if roi:
                full_annotated = frame.copy()
                full_annotated[y1:y2, x1:x2] = annotated
                cv2.rectangle(full_annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
                annotated = full_annotated
            
            img = Image.fromarray(annotated[..., ::-1])
            buffer = BytesIO()
            img.save(buffer, format='JPEG')
            annotated_frame = base64.b64encode(buffer.getvalue()).decode('utf-8')

        return detections, annotated_frame

    def get_available_classes(self) -> list[str]:
        return list(self.class_names.values())
