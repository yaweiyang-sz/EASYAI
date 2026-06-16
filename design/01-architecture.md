# System Architecture Design

## 1. System Overview

### 1.1 Project Positioning

AirBus Amber is an aviation cabin intelligent monitoring system that uses computer vision technology to analyze cabin camera footage in real-time, providing intelligent decision support for cabin crew.

### 1.2 Functional Scope

**Core Features:**
- Multi-type camera integration (RTSP network cameras, USB cameras, integrated cameras)
- Real-time video stream preview
- AI object detection and image classification
- Real-time alerts and event management
- Cabin status visualization (seat occupancy, passenger movement detection)

**Non-functional Requirements:**
- Low-latency video streaming (< 500ms end-to-end)
- Reliable AI detection (configurable confidence)
- Extensible algorithm architecture (support for multiple AI models)

---

## 2. Architecture Design

### 2.1 Microservices Architecture

The system adopts a microservices architecture with three independent services:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Service                          │
│                      (React + Vite, Port 3000)                   │
└─────────────────────────────────────────────────────────────────┘
                                  │
                    WebSocket + HTTP REST + SSE
                                  │
        ┌─────────────────────────┴─────────────────────────┐
        │                                                   │
┌───────┴────────┐                           ┌────────────┴──────────┐
│  Backend API   │                           │     AI Service        │
│  (FastAPI)     │                           │    (FastAPI)          │
│  Port: 8000    │                           │    Port: 8001          │
└───────┬────────┘                           └────────────┬──────────┘
        │                                                │
        │              ┌─────────────────┐                │
        └──────────────┤  RTSP Camera   ├────────────────┘
                       │    Simulator    │
                       │  or Real RTSP   │
                       └─────────────────┘
```

**Communication Patterns:**

| Service | Protocol | Purpose |
|---------|----------|---------|
| Frontend → Backend | WebSocket | Live video stream + real-time detection |
| Frontend → Backend | HTTP REST | Camera CRUD operations |
| Backend → AI Service | HTTP REST (httpx) | AI inference requests |
| Frontend → AI Service | HTTP REST | On-demand single frame analysis |

**Service Responsibilities:**

| Service | Responsibility | Tech Stack |
|---------|---------------|------------|
| Frontend | User interface, WebSocket stream manager, video rendering | React, TailwindCSS, Native WebSocket |
| Backend | Camera management, video streaming, WebSocket relay, AI orchestration | FastAPI, OpenCV, FFmpeg, httpx |
| AI Service | AI model inference, image annotation | FastAPI, Ultralytics YOLOv8 |

### 2.2 Technology Stack

**Backend Service:**
- **Framework**: FastAPI (Python 3.9+)
- **Video Processing**: OpenCV, FFmpeg
- **Async Communication**: httpx (async HTTP client)
- **WebSocket**: FastAPI native WebSocket support

**AI Service:**
- **Framework**: FastAPI + Ultralytics YOLOv8
- **Models**: YOLOv8 (object detection), YOLOv8-Cls (image classification)
- **GPU Support**: CUDA via PyTorch

**Frontend Service:**
- **Framework**: React 18 + Vite
- **Styling**: TailwindCSS
- **Routing**: React Router v6
- **Real-time Communication**: Native WebSocket API

### 2.3 Data Flow Architecture

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌───────────┐
│  RTSP   │────▶│   Backend   │────▶│  AI Service │     │  Frontend │
│ Camera  │     │   (FastAPI) │     │  (YOLOv8)   │     │           │
└─────────┘     └─────────────┘     └─────────────┘     └───────────┘
                      │                    │                    │
                      │                    │                    │
                      │   Frame Grabber    │   AI Inference      │
                      │   (30fps loop)     │   (2Hz loop)        │
                      │                    │                    │
                      │   WebSocket Frame  │   {detections}      │
                      │◀──────────────────│◀───────────────────│
                      │                    │                    │
                      │   {frame + detections}                   │
                      │◀─────────────────────────────────────────│
                      │                    │                    │
                      │   WebSocket JSON: {type: "frame",        │
                      │   frame: base64, detections: [...]}     │
```

**Key Components:**

| Component | Description | Rate |
|-----------|-------------|------|
| `frame_grabber_task` | Captures frames from camera, resizes, encodes to JPEG | 30fps (~33ms) |
| `algo_caller_task` | Calls AI service with current frame, stores results | 2Hz (500ms) |
| `CameraStreamState` | Shared state per camera: latest frame, detections, WebSocket clients | - |
| `WebSocket` | Sends bundled frame + detections to all connected clients | 30fps |

---

## 3. Deployment Architecture

### 3.1 Docker Compose Deployment

```yaml
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    networks:
      - camera-ai-network

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    networks:
      - camera-ai-network
    extra_hosts:
      - "host.docker.internal:host-gateway"

  ai-service:
    build: ./ai-service
    ports:
      - "8001:8001"
    networks:
      - camera-ai-network
    volumes:
      - ai-models:/root/.cache/torch

networks:
  camera-ai-network:
    driver: bridge
```

### 3.2 Environment Variables

| Variable Name | Description | Default Value |
|--------------|-------------|---------------|
| `PYTHONUNBUFFERED` | Python output buffering | `1` |
| `AI_SERVICE_URL` | AI service address | `http://ai-service:8001` |
| `BACKEND_PORT` | Backend service port | `8000` |
| `AI_SERVICE_PORT` | AI service port | `8001` |

---

## 4. Database/Storage

### 4.1 Camera Configuration Storage

Camera configurations are stored as JSON files in `backend/data/cameras.json`:

```json
{
  "cameras": [
    {
      "id": "camera_001",
      "name": "Cabin Entrance",
      "type": "rtsp",
      "source": "rtsp://192.168.1.100:554/stream",
      "enabled": true,
      "algorithms": [
        {
          "id": "algo_001",
          "name": "Passenger Detection",
          "algorithm_type": "object_detection",
          "enabled": true,
          "confidence": 0.5,
          "roi": null,
          "classes": ["person"]
        }
      ]
    }
  ]
}
```

### 4.2 AI Model Cache

YOLO model files are cached in Docker volume:
- Path: `/root/.cache/torch/hub/`
- Mount: `ai-models` volume

---

## 5. Security Considerations

### 5.1 CORS Configuration

All services have CORS enabled, allowing all origins (development environment):
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 5.2 Production Environment Recommendations

- [ ] Restrict CORS origins
- [ ] Add API authentication
- [ ] HTTPS encrypted transmission
- [ ] Video stream authentication

---

## 6. Extensibility Design

### 6.1 Algorithm Extension

The system supports extending new AI algorithms:

1. Define new algorithm types in `ai-service/models.py`
2. Implement corresponding processor class
3. Register new algorithm in `main.py`

### 6.2 Camera Type Extension

Currently supported:
- `rtsp`: RTSP network cameras
- `usb`: USB external cameras
- `integrated`: Integrated cameras

Extension method: Add new camera type handling logic in `camera_service.py`
