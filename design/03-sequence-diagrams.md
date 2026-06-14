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

### 1.1 Real-time Video Stream Retrieval

```plantuml
@startuml
title Real-time Video Stream Retrieval Flow

actor User
participant Frontend
participant Backend
participant "RTSP Camera"
participant "Camera Service"

User -> Frontend : Access camera detail page
Frontend -> Backend : GET /stream/{camera_id}
Backend -> "Camera Service" : start_stream(camera_id)
"Camera Service" -> "RTSP Camera" : Establish RTSP connection
"RTSP Camera" --> "Camera Service" : Video stream
"Camera Service" -> Backend : Continuous frame return
Backend -> Backend : Frame preprocessing
Backend --> Frontend : multipart/x-mixed-replace (MJPEG)
Frontend -> Frontend : Render video

@enduml
```

### 1.2 Video Frame Processing Flow

```plantuml
@startuml
title Video Frame Processing

participant "RTSP Stream"
participant "CameraService"
participant "AI Service"
participant "Annotated Frame"

"RTSP Stream" -> "CameraService" : Get raw frame
"CameraService" -> "CameraService" : resize_frame()\n(scale to fixed resolution)
alt AI detection enabled
    "CameraService" -> "AI Service" : POST /api/process\n(image, camera_id, algorithm)
    "AI Service" -> "AI Service" : YOLOv8 inference
    "AI Service" --> "CameraService" : detections + annotated_frame
end
"CameraService" -> "CameraService" : Encode to JPEG
--> Frontend : StreamingResponse
@enduml
```

---

## 2. AI Detection Flow

### 2.1 Single Frame AI Analysis

```plantuml
@startuml
title Single Frame AI Analysis Flow

actor User
participant Frontend
participant "AI Service"
participant "YOLO Model"

User -> Frontend : Click "Capture & Analyze"
Frontend -> Frontend : canvas.toBlob()\n(get current frame from video element)
Frontend -> "AI Service" : POST /api/process\n(image, camera_id, algorithm, confidence)
"AI Service" -> "AI Service" : Parse image
"AI Service" -> "YOLO Model" : model(frame)
"YOLO Model" --> "AI Service" : Detection/classification results
"AI Service" -> "AI Service" : Generate annotated image\n(base64)
"AI Service" --> Frontend : ProcessResponse\n(detections, classifications, annotated_frame)
Frontend -> Frontend : Display results

note right of Frontend
  Display content:
  - Processing time
  - Detected objects list
  - Annotated image
end note
@enduml
```

### 2.2 Real-time Detection Stream (EventSource)

```plantuml
@startuml
title Real-time Detection Stream

participant Frontend
participant Backend
participant "AI Service"
participant "EventSource"

Frontend -> Backend : GET /stream/{camera_id}/events
Backend -> Frontend : 200 OK (SSE connection)

loop Continuous detection (~30fps)
    Backend -> "AI Service" : Call AI inference
    "AI Service" --> Backend : Detection results
    Backend -> Backend : Update detection_results
    Backend --> Frontend : data: {"camera_id", "detections"}\n\n
    Frontend -> Frontend : Update UI display
end

note across
    Detection results are overlaid on video stream
    And pushed in real-time via SSE
end note
@enduml
```

### 2.3 Detection Result Update Mechanism

```plantuml
@startuml
title Detection Result Update

skinparam sequence {
    ActorBackgroundColor #LightBlue
    ParticipantBackgroundColor #LightGreen
}

participant "Video Frame" as Video
participant "AI Service" as AI
participant "Detection Store" as Store
participant "Frontend UI" as UI

Video -> AI : Send frame
AI -> AI : YOLO inference
AI -> Store : Update detection results\n(detections + timestamp)
Store --> UI : Push event (SSE)
UI -> UI : Refresh detection display

alt New detection
    Store -> Store : detection_results[camera_id]\n = {detections, timestamp}
else No detection
    Store -> Store : Delete camera_id record
end
@enduml
```

---

## 3. Camera Management

### 3.1 Add Camera

```plantuml
@startuml
title Add Camera Flow

actor Admin
participant Frontend
participant Backend
participant "Camera Service"

Admin -> Frontend : Click "Add Camera"
Frontend -> Frontend : Show add Modal
Admin -> Frontend : Fill camera info\n(name, type, source)
Frontend -> Backend : POST /api/cameras\n{body}
Backend -> "Camera Service" : Add camera config
"Camera Service" -> "Camera Service" : Save to cameras.json
"Camera Service" --> Backend : success
Backend --> Frontend : 201 Created\n{new_camera}
Frontend -> Frontend : Close Modal\nRefresh list
Frontend --> Admin : Show new camera
@enduml
```

### 3.2 Camera Type Processing

```plantuml
@startuml
title Different Camera Type Processing

partition RTSP Camera {
    :rtsp://192.168.1.100:554/stream;
    -> Use OpenCV cv2.VideoCapture;
}

partition USB Camera {
    :device_index (0, 1, 2...);
    -> Use OpenCV cv2.VideoCapture(index);
}

partition Integrated Camera {
    :device_index;
    -> Same as USB camera;
}

note across
    Unified in CameraService
    Provides unified get_frame() interface externally
end note
@enduml
```

---

## 4. Event Alerts

### 4.1 Alert Generation and Display

```plantuml
@startuml
title Alert Event Flow

actor User
participant Camera
participant Backend
participant Frontend
participant "Alert System"

Camera -> Backend : Anomaly detected
Backend -> Backend : Create Alert object
Backend -> "Alert System" : Add alert
"Alert System" --> Frontend : new_alert event (Socket.io)
Frontend -> User : Display new alert card
User -> Frontend : Click "Acknowledge"
Frontend -> Backend : Update alert status
Backend -> "Alert System" : Mark as resolved
@enduml
```

### 4.2 AI Detection Alerts

```plantuml
@startuml
title AI Detection Alerts

participant Camera
participant Backend
participant "Detection Store"
participant Frontend

Camera -> Backend : Video frame
Backend -> Backend : Call AI detection
Backend -> "Detection Store" : Update detection results
"Detection Store" --> Frontend : SSE event
Frontend -> Frontend : Create DetectionAlert
Frontend -> User : Display blue detection alert card
User -> Frontend : Click acknowledge
Frontend -> Frontend : Mark as resolved
@enduml
```

---

## 5. ROI Configuration

### 5.1 ROI Drawing Flow

```plantuml
@startuml
title ROI (Region of Interest) Configuration Flow

actor User
participant Frontend
participant Backend
participant "Camera Config"

User -> Frontend : Click "Draw ROI"
Frontend -> Frontend : Enter ROI mode\n(cursor: crosshair)

User -> Frontend : First click
Frontend -> Frontend : Record start point (roiStart)
Frontend -> Frontend : Show hint "Select end point"

User -> Frontend : Second click
Frontend -> Frontend : Calculate ROI coordinates\n{x1, y1, x2, y2}
Frontend -> Backend : PATCH /api/cameras/{id}\n{algorithms: [{roi: {...}}]}
Backend -> "Camera Config" : Save ROI config
"Camera Config" --> Backend : success
Backend --> Frontend : 200 OK
Frontend -> Frontend : Display ROI border

note across
    Double-click to cancel current selection
    ROI coordinates are pixel coordinates (relative to original image)
end note
@enduml
```

### 5.2 ROI Processing Flow

```plantuml
@startuml
title ROI Usage in AI Inference

participant Frame
participant Backend
participant "ROI Filter"
participant "AI Service"

Frame -> "ROI Filter" : Raw frame
"ROI Filter" -> "ROI Filter" : Crop ROI region\n(frame[y1:y2, x1:x2])
"ROI Filter" -> "AI Service" : Send cropped frame\n+ ROI parameters
"AI Service" -> "AI Service" : YOLO inference
"AI Service" --> "ROI Filter" : Detection results (bbox in relative coordinates)
"ROI Filter" -> "ROI Filter" : Restore bbox to original coordinates\n(bbox + x1, y1 offset)
"ROI Filter" --> Frame : Annotated frame
@enduml
```

---

## 6. System Initialization

### 6.1 Service Startup Sequence

```plantuml
@startuml
title System Startup Flow

participant Docker
participant Frontend
participant Backend
participant "AI Service"
participant Database

Docker -> Frontend : Start container
Docker -> Backend : Start container
Docker -> "AI Service" : Start container

"AI Service" -> "AI Service" : Load YOLO models\n(yolov8n.pt, yolov8n-cls.pt)
"AI Service" --> Backend : AI Service ready

Backend -> Database : Load camera config\n(cameras.json)
Backend -> Backend : Initialize camera service

Frontend -> Backend : Load camera list\nGET /api/cameras
Backend --> Frontend : Camera list
Frontend -> Frontend : Render Dashboard
@enduml
```

---

## 7. Key Interface Sequence Summary

| Endpoint | Method | Trigger | Sequence Diagram |
|----------|--------|---------|------------------|
| `/stream/{id}` | GET | View camera video | [Video Stream Processing](#1-video-stream-processing) |
| `/stream/{id}/events` | GET | Real-time detection | [Real-time Detection Stream](#22-real-time-detection-stream-eventsource) |
| `/api/process` | POST | Single frame analysis | [AI Detection Flow](#2-ai-detection-flow) |
| `/api/cameras` | POST | Add camera | [Camera Management](#3-camera-management) |
| `/api/cameras/{id}` | PATCH | Update config | [ROI Configuration](#5-roi-configuration) |
