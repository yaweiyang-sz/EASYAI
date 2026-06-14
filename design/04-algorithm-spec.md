# Algorithm Specification

This document provides detailed specifications for AI models to the Algorithm Team, including input/output formats, parameter configurations, and performance requirements.

---

## 1. Algorithm Overview

### 1.1 Current Algorithms

| Algorithm | Type | Model | Purpose |
|-----------|------|-------|---------|
| Object Detection | Object Detection | YOLOv8n (yolov8n.pt) | Detect and localize objects in images |
| Classification | Image Classification | YOLOv8n-Cls (yolov8n-cls.pt) | Classify entire images |

### 1.2 Algorithm Type Enumeration

```python
class AlgorithmType(str, Enum):
    OBJECT_DETECTION = "object_detection"
    CLASSIFICATION = "classification"
```

---

## 2. Input/Output Specifications

### 2.1 Object Detection

#### Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `image` | File (multipart) | Yes | JPEG/PNG image file |
| `camera_id` | string | Yes | Camera identifier |
| `algorithm` | string | Yes | Fixed value: `object_detection` |
| `confidence` | float | No | Confidence threshold (0.0-1.0), default 0.5 |
| `roi_x1` | float | No | ROI top-left X coordinate |
| `roi_y1` | float | No | ROI top-left Y coordinate |
| `roi_x2` | float | No | ROI bottom-right X coordinate |
| `roi_y2` | float | No | ROI bottom-right Y coordinate |
| `classes` | string | No | Comma-separated class filter, e.g., `person,car` |

#### Output

```json
{
  "camera_id": "camera_001",
  "algorithm": "object_detection",
  "detections": [
    {
      "label": "person",
      "confidence": 0.95,
      "bbox": [120.5, 80.2, 340.8, 560.3]
    },
    {
      "label": "cup",
      "confidence": 0.87,
      "bbox": [450.2, 300.1, 480.5, 340.7]
    }
  ],
  "classifications": [],
  "annotated_frame": "base64_encoded_jpeg...",
  "processing_time_ms": 45.23
}
```

#### Output Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `camera_id` | string | Camera ID |
| `algorithm` | string | Algorithm type used |
| `detections` | array | Detection result list |
| `detections[].label` | string | Object class name |
| `detections[].confidence` | float | Confidence score (0.0-1.0) |
| `detections[].bbox` | array[4] | Bounding box coordinates [x1, y1, x2, y2] (pixels) |
| `classifications` | array | Classification results (empty array) |
| `annotated_frame` | string | Base64-encoded JPEG annotated image |
| `processing_time_ms` | float | Processing time (milliseconds) |

### 2.2 Classification

#### Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `image` | File (multipart) | Yes | JPEG/PNG image file |
| `camera_id` | string | Yes | Camera identifier |
| `algorithm` | string | Yes | Fixed value: `classification` |
| `confidence` | float | No | Confidence threshold, default 0.5 (used for top_k filtering in classification) |

#### Output

```json
{
  "camera_id": "camera_001",
  "algorithm": "classification",
  "detections": [],
  "classifications": [
    {
      "label": "airplane",
      "confidence": 0.85
    },
    {
      "label": "bus",
      "confidence": 0.12
    },
    {
      "label": "train",
      "confidence": 0.02
    }
  ],
  "annotated_frame": "base64_encoded_jpeg...",
  "processing_time_ms": 32.15
}
```

#### Output Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `classifications` | array | Classification result list (sorted by confidence descending) |
| `classifications[].label` | string | Class name |
| `classifications[].confidence` | float | Confidence score (0.0-1.0) |
| `detections` | array | Detection results (empty array) |

---

## 3. ROI (Region of Interest)

### 3.1 ROI Workflow

```
Original Image (1920x1080)
    |
    | Specify ROI: x1=100, y1=200, x2=800, y2=600
    |
    v
Cropped ROI Region (700x400)
    |
    | YOLO Inference
    v
Detection Results (bbox relative to ROI)
    |
    | Coordinate restoration: bbox_x1 += 100, bbox_y1 += 200
    v
Final Results (bbox relative to original image)
```

### 3.2 ROI Parameter Description

| Parameter | Description | Example |
|-----------|-------------|---------|
| `roi_x1` | ROI top-left X coordinate (pixels) | 100 |
| `roi_y1` | ROI top-left Y coordinate (pixels) | 200 |
| `roi_x2` | ROI bottom-right X coordinate (pixels) | 800 |
| `roi_y2` | ROI bottom-right Y coordinate (pixels) | 600 |

### 3.3 Important Notes

- ROI coordinates must be within image bounds
- If ROI coordinates exceed image boundaries, the system will automatically clip to image bounds
- If ROI area is 0 or invalid, the entire image will be used

---

## 4. Class Filtering

### 4.1 Supported Classes (Object Detection)

80 classes supported by YOLOv8 COCO dataset:

```
person, bicycle, car, motorcycle, airplane, bus, train, truck, boat,
traffic light, fire hydrant, stop sign, parking meter, bench, bird, cat,
dog, horse, sheep, cow, elephant, bear, zebra, giraffe, backpack, umbrella,
handbag, tie, suitcase, frisbee, skis, snowboard, sports ball, kite,
baseball bat, baseball glove, skateboard, surfboard, tennis racket, bottle,
wine glass, cup, fork, knife, spoon, bowl, banana, apple, sandwich, orange,
broccoli, carrot, hot dog, pizza, donut, cake, chair, couch, potted plant,
bed, dining table, toilet, tv, laptop, mouse, remote, keyboard, cell phone,
microwave, oven, toaster, sink, refrigerator, book, clock, vase, scissors,
teddy bear, hair drier, toothbrush
```

### 4.2 Class Filter Examples

```
# Detect only person and cup
classes = "person,cup"

# Detect all classes (no filter)
classes = null or classes = ""
```

---

## 5. Image Specifications

### 5.1 Input Image Requirements

| Item | Requirement |
|------|-------------|
| Format | JPEG, PNG |
| Color Space | RGB |
| Max Size | Unlimited (internally resized) |
| Recommended Size | 1280x720 or lower |

### 5.2 Output Annotated Image

| Item | Requirement |
|------|-------------|
| Format | JPEG |
| Quality | 80% (cv2.IMWRITE_JPEG_QUALITY=80) |
| Size | Same as input image |
| Annotation Content | Bounding boxes + class labels + confidence |

### 5.3 Annotation Box Style

```
# YOLOv8 result.plot() default style
- Bounding box: 2px line
- Label: Class name + confidence percentage
- Color: Automatically assigned by class
```

---

## 6. Performance Requirements

### 6.1 Latency Targets

| Metric | Target | Description |
|--------|--------|-------------|
| Single frame processing time | < 100ms | YOLOv8n (P4 laptop) |
| Streaming frame rate | >= 20 FPS | Real-time video stream |
| API response time | < 500ms | P95 |

### 6.2 Throughput

| Scenario | Model | Expected FPS |
|----------|-------|--------------|
| Real-time stream (single) | yolov8n.pt | 20-30 FPS |
| Real-time stream (multiple) | - | Independent processing per stream |
| Batch processing | yolov8s.pt | 50+ FPS |

### 6.3 Resource Configuration

| Deployment | GPU | Memory | CPU |
|------------|-----|--------|-----|
| Development/Testing | None (CPU) | 2GB | 2 cores |
| Production (CPU) | - | 4GB | 4 cores |
| Production (GPU) | NVIDIA GPU | 2GB | 2 cores |

---

## 7. Error Handling

### 7.1 Error Response Format

```json
{
  "detail": "Error message description"
}
```

### 7.2 Error Types

| HTTP Status Code | Scenario | Example |
|------------------|----------|---------|
| 400 | Invalid image format | "File must be an image" |
| 400 | Image decode failure | "Failed to decode image: ..." |
| 404 | Algorithm not found | "Algorithm not found" |
| 500 | Internal error | AI inference exception |

---

## 8. Model Management

### 8.1 Currently Used Models

| Model | File | Purpose |
|-------|------|---------|
| yolov8n.pt | 6.3MB | Object detection (lightweight) |
| yolov8n-cls.pt | 6.4MB | Image classification (lightweight) |

### 8.2 Model Loading

```python
# Models are loaded at service startup
detector = YOLODetector("yolov8n.pt")
classifier = YOLOClassifier("yolov8n-cls.pt")
```

### 8.3 Model Update Process

1. Place new model files in `ai-service/models/` directory
2. Update model paths in `main.py`
3. Rebuild Docker image

---

## 9. Extension Recommendations

### 9.1 Adding New Algorithms

1. Define new algorithm type enumeration in `models.py`
2. Create new processor class (e.g., `YOLOSegmenter`)
3. Register and add routes in `main.py`

### 9.2 Custom Model Support

To use other models:
- YOLOv8 variants: `yolov8s.pt`, `yolov8m.pt`, `yolov8l.pt`, `yolov8x.pt`
- Train custom models: Use Ultralytics to train on your own dataset

### 9.3 Model Quantization (Optional)

To optimize performance, consider:
- PyTorch JIT compilation
- ONNX Runtime
- TensorRT (NVIDIA)
