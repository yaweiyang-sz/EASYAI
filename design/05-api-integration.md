# API Integration Documentation

This document provides complete API interface specifications for:
1. **Algorithm Team** - Integration with AI Service
2. **Frontend Team** - Integration with Backend Service

---

## 1. Backend Streaming API (Frontend Integration)

### 1.1 WebSocket Stream Endpoint (Primary)

**Endpoint**: `WebSocket /api/stream/{camera_id}/ws`

**Purpose**: Real-time video stream with AI detection results bundled in one message.

**Connection URL**:
```
ws://localhost:8000/api/stream/{camera_id}/ws
wss://production/api/stream/{camera_id}/ws
```

**Message Format** (Server → Client):

```json
{
  "type": "frame",
  "camera_id": "camera_001",
  "frame": "base64_encoded_jpeg...",
  "detections": [
    {"label": "person", "confidence": 0.95, "bbox": [x1, y1, x2, y2]}
  ],
  "annotated_frame": "base64_encoded_jpeg_with_boxes...",
  "timestamp": 1718001234.567
}
```

**Client → Server Messages**:

| Type | Description |
|------|-------------|
| `ping` | Keep-alive ping, server responds with `pong` |
| Any other | Ignored |

**Auto-Reconnect**: Frontend should implement reconnection logic with exponential backoff.

**Example** (JavaScript):
```javascript
const ws = new WebSocket('ws://localhost:8000/api/stream/camera_001/ws');

ws.onopen = () => console.log('Connected');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'frame' && data.frame) {
    // Render video frame
    renderFrame(data.frame);
    // Update detections
    updateDetections(data.detections);
  }
};

ws.onclose = () => {
  // Reconnect after delay
  setTimeout(() => connect(), 3000);
};
```

### 1.2 Legacy Endpoints (Backward Compatibility)

| Endpoint | Method | Description | Use Case |
|----------|--------|-------------|----------|
| `/api/stream/{id}` | GET | MJPEG stream | Not recommended |
| `/api/stream/{id}/snapshot` | GET | Single frame JPEG | Camera thumbnails |
| `/api/stream/{id}/events` | GET | SSE detection events | Legacy frontend |
| `/api/stream/{id}/detections` | GET | Current detections | Polling fallback |

---

## 2. AI Service API (Algorithm Team Integration)

### 2.1 Service Address

| Environment | AI Service Address | Port |
|-------------|-------------------|------|
| Development | `http://localhost:8001` | 8001 |
| Docker Container | `http://ai-service:8001` | 8001 |
| Production | `http://ai-service:8001` | 8001 |

### 1.2 Service Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/algorithms` | GET | Get available algorithm list |
| `/api/algorithms/{id}` | GET | Get algorithm details |
| `/api/process` | POST | Process image |
| `/api/classes/{algorithm}` | GET | Get supported classes |
| `/api/health` | GET | Health check |

---

## 3. Detailed Interface Specifications

### 2.1 Health Check

**Endpoint**: `GET /api/health`

**Response**:
```json
{
  "status": "healthy",
  "service": "ai-processing",
  "models_loaded": true
}
```

**Field Descriptions**:

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Service status (`healthy`/`unhealthy`) |
| `service` | string | Service name |
| `models_loaded` | boolean | Whether models are loaded successfully |

---

### 2.2 Get Algorithm List

**Endpoint**: `GET /api/algorithms`

**Response**:
```json
[
  {
    "id": "object_detection",
    "name": "YOLO Object Detection",
    "type": "object_detection",
    "description": "Detect objects in images using YOLOv8",
    "default_params": {
      "confidence": 0.5,
      "model": "yolov8n.pt"
    }
  },
  {
    "id": "classification",
    "name": "YOLO Image Classification",
    "type": "classification",
    "description": "Classify images using YOLOv8",
    "default_params": {
      "top_k": 5,
      "model": "yolov8n-cls.pt"
    }
  }
]
```

---

### 2.3 Get Algorithm Details

**Endpoint**: `GET /api/algorithms/{algorithm_id}`

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `algorithm_id` | string | Algorithm ID (`object_detection` or `classification`) |

**Response**:
```json
{
  "id": "object_detection",
  "name": "YOLO Object Detection",
  "type": "object_detection",
  "description": "Detect objects in images using YOLOv8",
  "default_params": {
    "confidence": 0.5,
    "model": "yolov8n.pt"
  }
}
```

**Error Response** (404):
```json
{
  "detail": "Algorithm not found"
}
```

---

### 3.4 Process Image (Core Interface)

**Endpoint**: `POST /api/process`

**Content-Type**: `multipart/form-data`

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `image` | file | Yes | Image file (JPEG/PNG) |
| `camera_id` | string | Yes | Camera identifier |
| `algorithm` | string | Yes | Algorithm type (`object_detection` or `classification`) |
| `confidence` | float | No | Confidence threshold (0.0-1.0), default 0.5 |
| `roi_x1` | float | No | ROI top-left X coordinate |
| `roi_y1` | float | No | ROI top-left Y coordinate |
| `roi_x2` | float | No | ROI bottom-right X coordinate |
| `roi_y2` | float | No | ROI bottom-right Y coordinate |
| `classes` | string | No | Comma-separated class filter |

**Request Example**:

```bash
curl -X POST "http://localhost:8001/api/process" \
  -F "image=@/path/to/image.jpg" \
  -F "camera_id=camera_001" \
  -F "algorithm=object_detection" \
  -F "confidence=0.5" \
  -F "classes=person,cup"
```

**Response** (Success):

```json
{
  "camera_id": "camera_001",
  "algorithm": "object_detection",
  "detections": [
    {
      "label": "person",
      "confidence": 0.9523,
      "bbox": [120.5, 80.2, 340.8, 560.3]
    }
  ],
  "classifications": [],
  "annotated_frame": "/9j/4AAQSkZJRgABAQAAAQ...",
  "processing_time_ms": 45.23
}
```

**Response** (Error - 400):

```json
{
  "detail": "File must be an image"
}
```

---

### 2.5 Get Supported Classes

**Endpoint**: `GET /api/classes/{algorithm}`

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `algorithm` | string | Algorithm type (`object_detection` or `classification`) |

**Response**:

```json
{
  "classes": [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus",
    "train", "truck", "boat", "traffic light", "fire hydrant",
    "stop sign", "parking meter", "bench", "bird", "cat", "dog",
    "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe",
    "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
    "skis", "snowboard", "sports ball", "kite", "baseball bat",
    "baseball glove", "skateboard", "surfboard", "tennis racket",
    "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl",
    "banana", "apple", "sandwich", "orange", "broccoli", "carrot",
    "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant",
    "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote",
    "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear",
    "hair drier", "toothbrush"
  ]
}
```

---

## 4. Data Format Details

### 3.1 Bounding Box Format

Detection results use `[x1, y1, x2, y2]` format for bounding boxes:

```
     y1
      ^
      |
      |     (x1, y1)--------+
      |         |           |
      |         |           |
      |         +--------(x2, y2)
      |                  |
      +------------------>x2
```

| Coordinate | Description |
|------------|-------------|
| `x1` | Bounding box top-left X coordinate (pixels) |
| `y1` | Bounding box top-left Y coordinate (pixels) |
| `x2` | Bounding box bottom-right X coordinate (pixels) |
| `y2` | Bounding box bottom-right Y coordinate (pixels) |

### 3.2 Base64 Encoded Image

The `annotated_frame` field is a Base64-encoded JPEG string.

**Decode Example** (Python):
```python
import base64
from PIL import Image
from io import BytesIO

# Get from response
base64_string = response["annotated_frame"]

# Decode to image
image_data = base64.b64decode(base64_string)
image = Image.open(BytesIO(image_data))
image.save("annotated.jpg")
```

**Decode Example** (JavaScript):
```javascript
const base64String = response.annotated_frame;
const binaryString = atob(base64String);
const bytes = new Uint8Array(binaryString.length);
for (let i = 0; i < binaryString.length; i++) {
  bytes[i] = binaryString.charCodeAt(i);
}
const blob = new Blob([bytes], { type: 'image/jpeg' });
const imageUrl = URL.createObjectURL(blob);
```

---

## 4. Calling Examples

### 4.1 Python Example

```python
import httpx
import base64
from PIL import Image
from io import BytesIO

async def process_image(image_path: str, camera_id: str):
    async with httpx.AsyncClient(timeout=30.0) as client:
        with open(image_path, "rb") as f:
            files = {"image": ("frame.jpg", f, "image/jpeg")}
            data = {
                "camera_id": camera_id,
                "algorithm": "object_detection",
                "confidence": 0.5
            }
            response = await client.post(
                "http://localhost:8001/api/process",
                files=files,
                data=data
            )
        
        if response.status_code == 200:
            result = response.json()
            print(f"Detections: {result['detections']}")
            print(f"Processing time: {result['processing_time_ms']}ms")
            
            # Save annotated image
            if result["annotated_frame"]:
                img_data = base64.b64decode(result["annotated_frame"])
                with open("output.jpg", "wb") as f:
                    f.write(img_data)
        else:
            print(f"Error: {response.text}")
```

### 4.2 JavaScript/TypeScript Example

```typescript
interface Detection {
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
}

interface ProcessResponse {
  camera_id: string;
  algorithm: string;
  detections: Detection[];
  classifications: any[];
  annotated_frame: string;
  processing_time_ms: number;
}

async function processImage(
  imageFile: File,
  cameraId: string,
  algorithm: 'object_detection' | 'classification' = 'object_detection'
): Promise<ProcessResponse> {
  const formData = new FormData();
  formData.append('image', imageFile);
  formData.append('camera_id', cameraId);
  formData.append('algorithm', algorithm);
  formData.append('confidence', '0.5');

  const response = await fetch('http://localhost:8001/api/process', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
}
```

### 5.3 cURL Examples

```bash
# Object Detection
curl -X POST "http://localhost:8001/api/process" \
  -F "image=@test.jpg" \
  -F "camera_id=test_camera" \
  -F "algorithm=object_detection" \
  -F "confidence=0.6" \
  -F "classes=person,cup"

# Image Classification
curl -X POST "http://localhost:8001/api/process" \
  -F "image=@test.jpg" \
  -F "camera_id=test_camera" \
  -F "algorithm=classification"

# With ROI
curl -X POST "http://localhost:8001/api/process" \
  -F "image=@test.jpg" \
  -F "camera_id=test_camera" \
  -F "algorithm=object_detection" \
  -F "roi_x1=100" \
  -F "roi_y1=100" \
  -F "roi_x2=500" \
  -F "roi_y2=400"
```

---

## 5. Integration Checklist

### 5.1 Algorithm Team Should Provide

- [ ] AI service Docker image or source code
- [ ] List of model files used
- [ ] API interface implementation (following above specifications)
- [ ] List of supported algorithm types
- [ ] Error code definitions

### 5.2 Interface Compliance Requirements

- [ ] Response format consistent with this document
- [ ] Support `multipart/form-data` upload
- [ ] Support `confidence` parameter (0.0-1.0)
- [ ] Support ROI parameters
- [ ] Support `classes` filter parameter
- [ ] Return Base64-encoded annotated image
- [ ] Return `processing_time_ms` field

### 5.3 Performance Requirements

- [ ] Single frame processing < 100ms (YOLOv8n)
- [ ] Support concurrent requests
- [ ] Stable memory usage (no memory leaks)

### 5.4 Error Handling

- [ ] 400: Invalid input (image format error, etc.)
- [ ] 404: Algorithm not found
- [ ] 500: Internal error

---

## 6. Contacts

| Role | Responsibility | Contact |
|------|---------------|---------|
| Product Manager | Requirement confirmation | [TBD] |
| Frontend Team | UI integration | [TBD] |
| Backend Team | Service integration | [TBD] |
| Algorithm Team | Model provision | [TBD] |

---

## 8. Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-06-14 | Initial version |
