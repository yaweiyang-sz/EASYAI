# Camera AI Dashboard

A web-based application for camera streaming with AI processing capabilities.

## Features

1. **Camera Support**
   - RTSP streams
   - USB cameras
   - Integrated cameras

2. **Camera Management**
   - Add/delete cameras
   - Enable/disable cameras
   - View live streams

3. **AI Processing (Microservice Architecture)**
   - RESTful API for algorithm configuration
   - YOLO-based Object Detection
   - YOLO-based Image Classification

## Architecture

```
webcam-ai-app/
├── backend/              # Camera management & streaming service
│   ├── api/             # REST API endpoints
│   ├── services/        # Business logic
│   └── main.py          # FastAPI application
├── ai-service/          # AI processing microservice
│   ├── detector.py      # YOLO object detection
│   ├── classifier.py    # YOLO classification
│   └── main.py          # FastAPI application
└── frontend/            # React web application
    └── src/
        ├── pages/       # Page components
        └── services/     # API client
```

## Quick Start with Docker

One-command startup for testing:

```bash
cd webcam-ai-app

# Start all services (CPU mode) - includes RTSP test server
docker-compose up -d

# Or with GPU support
docker-compose -f docker-compose.gpu.yml up -d
```

Access the application at **http://localhost:3000**

### Test RTSP Stream

When using Docker Compose, a built-in RTSP test server is included. You can add a camera with this URL:

```
rtsp://localhost:8554/camera1
```

This provides a simulated video stream for testing without needing real hardware.

### Docker Management Commands

Using Makefile (recommended):

```bash
make up          # Start all services
make down        # Stop all services
make restart     # Restart all services
make logs        # View all logs
make logs-backend   # View backend logs
make logs-ai        # View AI service logs
make logs-frontend  # View frontend logs
make status      # Show container status
make clean       # Remove containers and volumes
```

Or using Docker Compose directly:

```bash
docker-compose up -d      # Start
docker-compose down      # Stop
docker-compose logs -f   # View logs
docker-compose ps        # Status
```

## Manual Installation

### Backend Service (Port 8000)

```bash
cd webcam-ai-app/backend
pip install -r requirements.txt
python main.py
```

### AI Service (Port 8001)

```bash
cd webcam-ai-app/ai-service
pip install -r requirements.txt
python main.py
```

### Frontend (Port 3000)

```bash
cd webcam-ai-app/frontend
npm install
npm run dev
```

## API Endpoints

### Backend Service (Port 8000)

- `GET /api/cameras` - List all cameras
- `POST /api/cameras` - Add a camera
- `GET /api/cameras/{id}` - Get camera details
- `PATCH /api/cameras/{id}` - Update camera
- `DELETE /api/cameras/{id}` - Delete camera
- `GET /stream/{id}` - Live stream video
- `GET /stream/{id}/snapshot` - Get current frame
- `GET /api/health` - Health check

### AI Service (Port 8001)

- `GET /api/algorithms` - List available algorithms
- `GET /api/algorithms/{id}` - Get algorithm details
- `POST /api/process` - Process image with AI
- `GET /api/classes/{algorithm}` - Get supported classes
- `GET /api/health` - Health check

## Adding a Camera

1. Navigate to "Cameras" page
2. Click "Add Camera"
3. Select camera type:
   - **RTSP**: Enter the RTSP URL (e.g., `rtsp://192.168.1.100:554/stream`)
   - **USB/Integrated**: Enter device index (0, 1, 2...) or device path
4. Set a name and save

## Using AI Processing

1. View a camera from the Dashboard
2. Enable "AI Processing"
3. Select algorithm (Object Detection or Classification)
4. Click "Capture & Analyze"
5. View results below

## Camera Types

- `rtsp` - Network cameras using RTSP protocol
- `usb` - External USB cameras
- `integrated` - Built-in laptop/PC cameras

## AI Algorithms

### Object Detection (YOLOv8)
Detects and localizes objects in the video frame with bounding boxes and confidence scores.

### Classification (YOLOv8)
Classifies the entire image into predefined categories.
