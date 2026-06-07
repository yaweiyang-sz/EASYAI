# Simple Camera MJPEG Server

## Overview
A simple MJPEG server that provides video streams from two sources:

1. **Local Video Stream** (`/stream/localvideo0`)
   - Streams a local video file in a loop
   - Default: `test_video.mp4`

2. **Webcam Stream** (`/stream/webcam0`)
   - Streams from your local webcam or USB camera
   - Default: device 0

## Quick Start

### Windows
Double-click `start_camera_server.bat`

### Linux / Mac
```bash
cd rtsp-simulator
chmod +x start_camera_server.sh
./start_camera_server.sh
```

### Command Line (All Platforms)
```bash
cd rtsp-simulator
python camera_server.py
```

## Options

```
python camera_server.py [--port PORT] [--video VIDEO_PATH] [--webcam WEBCAM_INDEX]
```

- `--port`, `-p`: HTTP server port (default: 9000)
- `--video`, `-v`: Path to local video file (default: test_video.mp4)
- `--webcam`, `-w`: Webcam device index (default: 0)

## Usage in Camera AI Dashboard

1. Open http://localhost:3000
2. Go to the **Cameras** page
3. Click **Add Camera**
4. Select **RTSP Stream** type
5. Enter one of the following URLs:
   - Local video: `http://localhost:9000/stream/localvideo0`
   - Webcam: `http://localhost:9000/stream/webcam0`
6. Click **Add Camera**

## Dashboard

Check the server status and preview streams at:  
http://localhost:9000/