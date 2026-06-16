# Sequence Diagrams

This document presents UML sequence diagrams for core business processes, intended for:
- Confirming business processes with Product Managers
- Explaining integration sequences with the Algorithm Team

---

## Table of Contents

1. [Video Stream Processing](#1-video-stream-processing)
2. [AI Detection Flow](#2-ai-detection-flow)
3. [Camera Management](#3-camera-management)
4. [Event Alerts](#4-event-alerts)
5. [ROI Configuration](#5-roi-configuration)

---

## 1. Video Stream Processing

### 1.1 Real-time Video Stream via WebSocket

```mermaid
sequenceDiagram
    title Real-time Video Stream via WebSocket
    actor User
    participant Frontend
    participant Backend
    participant "RTSP Camera"
    participant "AI Service"

    User->>Frontend: Access dashboard
    Frontend->>Backend: WebSocket /api/stream/{camera_id}/ws
    Backend->>"RTSP Camera": Establish RTSP connection
    "RTSP Camera"-->>Backend: Video stream
    Backend->>Backend: frame_grabber_task (30fps loop)
    Backend->>"AI Service": Call /api/process (2Hz)
    "AI Service"-->>Backend: detections + annotated_frame
    Backend->>Backend: Bundle frame + detections
    Backend-->>Frontend: WebSocket: {type: "frame", frame: base64, detections: [...]}
    Frontend->>Frontend: Render video with overlay
```

### 1.2 Video Frame Processing Flow

```mermaid
sequenceDiagram
    title Video Frame Processing & AI Detection
    participant "RTSP Stream"
    participant "Backend"
    participant "AI Service"
    participant Frontend

    "RTSP Stream"->>"Backend": Raw frame (continuous)
    "Backend"->>"Backend": frame_grabber_task (30fps)
    "Backend"->>"Backend": Resize frame (fixed resolution)
    
    "Backend"->>"AI Service": POST /api/process (every 0.5s)
    "AI Service"->>"AI Service": YOLOv8 inference
    "AI Service"-->>"Backend": detections + annotated_frame
    
    "Backend"->>"Backend": Bundle frame + detections
    "Backend"->>Frontend: WebSocket message (JSON)
    Note over Frontend: Message format:<br/>{type: "frame", frame: base64,<br/>detections: [...], annotated_frame: base64}
```

### 1.3 Legacy MJPEG Endpoint (Backward Compatibility)

```mermaid
sequenceDiagram
    title Legacy MJPEG Stream (HTTP)
    participant Frontend
    participant Backend
    participant "RTSP Camera"

    Frontend->>Backend: GET /api/stream/{camera_id}
    Backend->>"RTSP Camera": Establish RTSP connection
    "RTSP Camera"-->>Backend: Video stream
    Backend-->>Frontend: multipart/x-mixed-replace (MJPEG)
    Note over Frontend: Not recommended - use WebSocket instead
```

---

## 2. AI Detection Flow

### 2.1 Backend-Initiated AI Detection (Primary)

> **Note:** The backend internally calls the AI service at 2Hz (every 500ms) and bundles results with video frames. Frontend does NOT need to make direct AI calls for real-time detection.

```mermaid
sequenceDiagram
    title Backend-Initiated AI Detection
    participant Frontend
    participant Backend
    participant "AI Service"
    participant "YOLO Model"

    Frontend->>Backend: Connect WebSocket
    loop Continuous (30fps)
        Backend->>Backend: frame_grabber_task
    end
    loop AI Detection (2Hz)
        Backend->>"AI Service": POST /api/process (with ROI, classes filter)
        "AI Service"->>"YOLO Model": model(frame)
        "YOLO Model"-->>"AI Service": Detection results
        "AI Service"-->>Backend: {detections, annotated_frame}
        Backend->>Backend: Update latest_detections
    end
    Backend-->>Frontend: WebSocket: {frame, detections}
    Frontend->>Frontend: Update UI
```

### 2.2 Single Frame AI Analysis (On-Demand)

> For manual "Capture & Analyze" functionality.

```mermaid
sequenceDiagram
    title Single Frame AI Analysis (On-Demand)
    actor User
    participant Frontend
    participant "AI Service"
    participant "YOLO Model"

    User->>Frontend: Click "Capture & Analyze"
    Frontend->>Frontend: Get current frame from video element
    Frontend->>"AI Service": POST /api/process (image, algorithm, confidence, roi)
    "AI Service"->>"YOLO Model": model(frame)
    "YOLO Model"-->>"AI Service": Detection/classification results
    "AI Service"->>"AI Service": Generate annotated image (base64)
    "AI Service"-->>Frontend: {detections, classifications, annotated_frame, processing_time_ms}
    Frontend->>Frontend: Display results
```

### 2.3 Real-time Detection via WebSocket

```mermaid
sequenceDiagram
    title Real-time Detection via WebSocket
    participant Frontend
    participant Backend
    participant "AI Service"
    participant "EventSource"

    Frontend->>Backend: WebSocket /api/stream/{camera_id}/ws
    Backend-->>Frontend: 101 Switching Protocols

    loop Continuous (~30fps)
        Backend->>Backend: Grab frame
    end
    loop Every 0.5s (2Hz)
        Backend->>"AI Service": Call AI inference
        "AI Service"-->>Backend: Detection results
        Backend->>Backend: Store detections
    end
    Backend-->>Frontend: WebSocket: {type: "frame", frame: base64, detections: [...]}
    Frontend->>Frontend: Update video + detection overlay
```

**Key Points:**
- Detection results are embedded in the same WebSocket message as video frames
- No need for separate SSE connection or frontend-initiated AI calls
- Backend throttles AI calls to 2Hz to balance performance and resource usage

### 2.4 Legacy SSE Endpoint (Backward Compatibility)

```mermaid
sequenceDiagram
    title Legacy Detection SSE (EventSource)
    participant Frontend
    participant Backend
    participant "Detection Store"

    Frontend->>Backend: EventSource GET /api/stream/{camera_id}/events
    Backend-->>Frontend: 200 OK (SSE connection)

    loop Continuous
        Backend->>"Detection Store": Check for new results
        "Detection Store"-->>Backend: Latest detection data
        Backend-->>Frontend: data: {camera_id, detections}
        Frontend->>Frontend: Update detection display
    end
```

**Note:** The SSE endpoint still exists for backward compatibility but WebSocket is recommended.

---

## 3. Camera Management

### 3.1 Add Camera

```mermaid
sequenceDiagram
    title Add Camera Flow
    actor Admin
    participant Frontend
    participant Backend
    participant "Camera Service"

    Admin->>Frontend: Click "Add Camera"
    Frontend->>Frontend: Show add Modal
    Admin->>Frontend: Fill camera info (name, type, source)
    Frontend->>Backend: POST /api/cameras {body}
    Backend->>"Camera Service": Add camera config
    "Camera Service"->>"Camera Service": Save to cameras.json
    "Camera Service"-->>Backend: success
    Backend-->>Frontend: 201 Created {new_camera}
    Frontend->>Frontend: Close Modal, Refresh list
    Frontend-->>Admin: Show new camera
```

### 3.2 Camera Type Processing

```mermaid
flowchart TB
    subgraph RTSP_Camera["RTSP Camera"]
        A1["rtsp://192.168.1.100:554/stream"] --> B1["Use OpenCV cv2.VideoCapture"]
    end

    subgraph USB_Camera["USB Camera"]
        A2["device_index (0, 1, 2...)"] --> B2["Use OpenCV cv2.VideoCapture(index)"]
    end

    subgraph Integrated_Camera["Integrated Camera"]
        A3["device_index"] --> B3["Same as USB camera"]
    end

    B1 & B2 & B3 --> C["Unified CameraService<br/>get_frame() interface"]
```

**Note:** All camera types are unified in CameraService, providing a consistent `get_frame()` interface externally.

---

## 4. Event Alerts

### 4.1 Alert Generation and Display

```mermaid
sequenceDiagram
    title Alert Event Flow
    actor User
    participant Camera
    participant Backend
    participant Frontend
    participant "Alert System"

    Camera->>Backend: Anomaly detected
    Backend->>Backend: Create Alert object
    Backend->>"Alert System": Add alert
    "Alert System"-->>Frontend: new_alert event (Socket.io)
    Frontend->>User: Display new alert card
    User->>Frontend: Click "Acknowledge"
    Frontend->>Backend: Update alert status
    Backend->>"Alert System": Mark as resolved
```

### 4.2 AI Detection Alerts

```mermaid
sequenceDiagram
    title AI Detection Alerts
    participant Camera
    participant Backend
    participant "Detection Store"
    participant Frontend

    Camera->>Backend: Video frame
    Backend->>Backend: Call AI detection
    Backend->>"Detection Store": Update detection results
    "Detection Store"-->>Frontend: SSE event
    Frontend->>Frontend: Create DetectionAlert
    Frontend->>User: Display blue detection alert card
    User->>Frontend: Click acknowledge
    Frontend->>Frontend: Mark as resolved
```

---

## 5. ROI Configuration

### 5.1 ROI Drawing Flow

```mermaid
sequenceDiagram
    title ROI (Region of Interest) Configuration Flow
    actor User
    participant Frontend
    participant Backend
    participant "Camera Config"

    User->>Frontend: Click "Draw ROI"
    Frontend->>Frontend: Enter ROI mode (cursor: crosshair)
    User->>Frontend: First click
    Frontend->>Frontend: Record start point (roiStart)
    Frontend->>Frontend: Show hint "Select end point"
    User->>Frontend: Second click
    Frontend->>Frontend: Calculate ROI coordinates {x1, y1, x2, y2}
    Frontend->>Backend: PATCH /api/cameras/{id} (Algorithms: [{roi: {...}}])
    Backend->>"Camera Config": Save ROI config
    "Camera Config"-->>Backend: success
    Backend-->>Frontend: 200 OK
    Frontend->>Frontend: Display ROI border
```

**Note:** Double-click to cancel current selection. ROI coordinates are pixel coordinates (relative to original image).

### 5.2 ROI Processing Flow

```mermaid
sequenceDiagram
    title ROI Usage in AI Inference
    participant Frame
    participant Backend
    participant "ROI Filter"
    participant "AI Service"

    Frame->>"ROI Filter": Raw frame
    "ROI Filter"->>"ROI Filter": Crop ROI region (frame[y1:y2, x1:x2])
    "ROI Filter"->>"AI Service": Send cropped frame + ROI parameters
    "AI Service"->>"AI Service": YOLO inference
    "AI Service"-->>"ROI Filter": Detection results (bbox in relative coordinates)
    "ROI Filter"->>"ROI Filter": Restore bbox to original coordinates (bbox + x1, y1 offset)
    "ROI Filter"-->>Frame: Annotated frame
```

---

## 6. System Initialization

### 6.1 Service Startup Sequence

```mermaid
sequenceDiagram
    title System Startup Flow
    participant Docker
    participant Frontend
    participant Backend
    participant "AI Service"
    participant "Camera Config"

    Docker->>Frontend: Start container
    Docker->>Backend: Start container
    Docker->>"AI Service": Start container

    "AI Service"->>"AI Service": Load YOLO models (yolov8n.pt, yolov8n-cls.pt)
    "AI Service"-->>Backend: AI Service ready

    Backend->>"Camera Config": Load camera config (cameras.json)
    Backend->>Backend: Initialize camera service

    Frontend->>Backend: Load camera list GET /api/cameras
    Backend-->>Frontend: Camera list
    Frontend->>Frontend: Render Dashboard
```

### 6.2 WebSocket Connection Lifecycle

```mermaid
sequenceDiagram
    title WebSocket Stream Lifecycle
    participant Frontend
    participant Backend
    participant "Frame Grabber"
    participant "AI Caller"

    Frontend->>Backend: Connect WebSocket /api/stream/{id}/ws
    Backend->>Backend: ensure_tasks_running()
    Backend->>"Frame Grabber": Start/Resume task
    Backend->>"AI Caller": Start/Resume task
    Backend-->>Frontend: WebSocket connected

    loop Continuous (30fps)
        "Frame Grabber"->>"Frame Grabber": Grab frame
        "Frame Grabber"->>Backend: Update latest_frame
    end
    
    loop Every 0.5s (2Hz)
        "AI Caller"->>"AI Caller": Check enabled algorithms
        "AI Caller"->>"AI Caller": Call AI service
        "AI Caller"->>Backend: Update latest_detections
    end
    
    Backend-->>Frontend: WebSocket: {frame, detections}
    
    Note over Frontend,Backend: Tasks persist when all clients disconnect<br/>(resume immediately when new client connects)

    Frontend->>Backend: Close WebSocket
    Backend->>Backend: Remove connection from pool
    Note over Backend: Tasks continue running (not stopped)
```

### 6.3 Frontend WebSocket Integration

```mermaid
sequenceDiagram
    title Frontend Stream Manager
    participant "streamManager.js"
    participant Frontend
    participant Backend

    Note over "streamManager.js": Module-level singleton<br/>Survives component unmounts

    Frontend->>"streamManager.js": subscribe(cameraId, callbacks)
    "streamManager.js"->>"streamManager.js": Get or create camera state
    "streamManager.js"->>"streamManager.js": Add callback to subscribers
    
    alt WebSocket not connected
        "streamManager.js"->>Backend: Connect WebSocket
        Backend-->>"streamManager.js": Connection established
    end
    
    loop On frame received
        Backend-->>"streamManager.js": {type: "frame", frame: base64, detections: [...]}
        "streamManager.js"->>"streamManager.js": Parse message
        "streamManager.js"->>Frontend: callbacks.onFrame(base64, data)
        alt Has detections
            "streamManager.js"->>Frontend: callbacks.onDetection(detections)
        end
    end

    Frontend->>"streamManager.js": Unsubscribe
    "streamManager.js"->>"streamManager.js": Remove from subscribers
    Note over "streamManager.js": Disconnect after 5s if no subscribers remain
```

---

## 7. Key Interface Sequence Summary

| Endpoint | Method | Type | Description | Sequence Diagram |
|----------|--------|------|-------------|------------------|
| `/api/stream/{id}/ws` | WebSocket | **Primary** | Live video + AI detection | [WebSocket Stream](#11-real-time-video-stream-via-websocket) |
| `/api/stream/{id}` | GET | HTTP (Legacy) | MJPEG stream | [Legacy MJPEG](#13-legacy-mjpeg-endpoint-backward-compatibility) |
| `/api/stream/{id}/events` | GET | SSE (Legacy) | Real-time detection events | [Legacy SSE](#24-legacy-sse-endpoint-backward-compatibility) |
| `/api/process` | POST | REST | Single frame AI analysis | [On-Demand AI](#22-single-frame-ai-analysis-on-demand) |
| `/api/cameras` | POST | REST | Add camera | [Camera Management](#3-camera-management) |
| `/api/cameras/{id}` | PATCH | REST | Update config | [ROI Configuration](#5-roi-configuration) |

