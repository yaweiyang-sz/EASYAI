import time
import base64
import numpy as np
from ultralytics import YOLO
from PIL import Image
from io import BytesIO

class YOLOClassifier:
    def __init__(self, model_name: str = "yolov8n-cls.pt"):
        self.model = YOLO(model_name)
        self.class_names = self.model.names

    def classify(self, frame: np.ndarray, top_k: int = 5) -> tuple[list, list]:
        results = self.model(frame, verbose=False)
        classifications = []
        annotated_frame = None

        if len(results) > 0:
            result = results[0]
            probs = result.probs

            if probs is not None:
                top_indices = np.argsort(probs.data.cpu().numpy())[-top_k:][::-1]
                for idx in top_indices:
                    cls = int(idx)
                    conf = float(probs.data[cls])
                    label = self.class_names[cls]
                    classifications.append({
                        "label": label,
                        "confidence": conf
                    })

            annotated = result.plot()
            img = Image.fromarray(annotated[..., ::-1])
            buffer = BytesIO()
            img.save(buffer, format='JPEG')
            annotated_frame = base64.b64encode(buffer.getvalue()).decode('utf-8')

        return classifications, annotated_frame

    def get_available_classes(self) -> list[str]:
        return list(self.class_names.values())
