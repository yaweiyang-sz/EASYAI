"""
Simple Camera MJPEG Server
Supports:
1. /stream/localvideo0 - Local video file stream
2. /stream/webcam0 - Local webcam/USB camera stream
3. / - Camera status dashboard
"""

import cv2
import numpy as np
import time
import threading
import os
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import datetime

# Global variables
_server_instance = None


class VideoStreamSource:
    """Base class for video stream sources"""
    
    def __init__(self, source_id, name, fps=30):
        self.source_id = source_id
        self.name = name
        self.fps = fps
        self.running = False
        self.connected = False
        self.error_message = None
        self.current_frame = None
        self.frame_lock = threading.Lock()
        self.frame_count = 0
        self.thread = None
    
    def start(self):
        """Start the source"""
        raise NotImplementedError()
    
    def stop(self):
        """Stop the source"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=1)
    
    def _generate_test_frame(self):
        """Generate a test frame when stream is not available"""
        height, width = 480, 640
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        frame[:, :] = (30, 40, 50)
        
        cv2.putText(frame, f"Source: {self.name}", (20, 40), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 2)
        cv2.putText(frame, datetime.datetime.now().strftime('%H:%M:%S'), (20, 80), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (150, 150, 150), 1)
        
        if not self.connected:
            status_text = "Status: Disconnected"
            cv2.putText(frame, status_text, (20, 120), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 100, 100), 1)
            if self.error_message:
                cv2.putText(frame, f"Error: {self.error_message[:30]}...", (20, 145), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 100, 100), 1)
        
        return frame
    
    def get_frame_jpeg(self):
        """Get current frame as JPEG bytes"""
        with self.frame_lock:
            if self.current_frame is not None:
                ret, buffer = cv2.imencode('.jpg', self.current_frame, 
                                           [cv2.IMWRITE_JPEG_QUALITY, 80])
                if ret:
                    return buffer.tobytes()
        
        # Return test frame if no actual frame available
        test_frame = self._generate_test_frame()
        ret, buffer = cv2.imencode('.jpg', test_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if ret:
            return buffer.tobytes()
        return None
    
    def get_status(self):
        """Get source status"""
        return {
            'id': self.source_id,
            'name': self.name,
            'connected': self.connected,
            'error': self.error_message,
            'frame_count': self.frame_count
        }


class LocalVideoStream(VideoStreamSource):
    """Stream from local video file"""
    
    def __init__(self, video_path, fps=30):
        super().__init__("localvideo0", "Local Video File", fps)
        self.video_path = video_path
        self.cap = None
    
    def _try_open_video(self):
        """Try to open video file in a separate thread"""
        try:
            if not os.path.exists(self.video_path):
                self.connected = False
                self.error_message = f"Video file not found: {self.video_path}"
                print(f"[ERROR] {self.error_message}")
                return
            
            cap = cv2.VideoCapture(self.video_path)
            if not cap.isOpened():
                self.connected = False
                self.error_message = f"Cannot open video file: {self.video_path}"
                print(f"[ERROR] {self.error_message}")
                return
            
            self.cap = cap
            self.connected = True
            print(f"[OK] Local video opened: {self.video_path}")
            
            # Start frame reading thread
            self.thread = threading.Thread(target=self._loop, daemon=True)
            self.thread.start()
        except Exception as e:
            self.connected = False
            self.error_message = f"Video error: {e}"
            print(f"[ERROR] {self.error_message}")
    
    def start(self):
        """Start video stream with timeout protection"""
        self.running = True
        
        # Try to open video in a separate thread to avoid blocking
        open_thread = threading.Thread(target=self._try_open_video, daemon=True)
        open_thread.start()
        open_thread.join(timeout=5.0)  # Wait max 5 seconds
        
        if not self.connected:
            self.error_message = self.error_message or f"Video connection timeout: {self.video_path}"
            print(f"[WARN] {self.error_message}")
    
    def stop(self):
        """Stop video stream"""
        self.running = False
        if self.cap:
            self.cap.release()
        super().stop()
        print("[OK] Local video stopped")
    
    def _loop(self):
        """Read frames in loop"""
        frame_delay = 1.0 / self.fps
        
        while self.running and self.cap.isOpened():
            ret, frame = self.cap.read()
            
            if not ret:
                # Loop video
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue
            
            # Resize to standard size
            if frame.shape[1] != 640 or frame.shape[0] != 480:
                frame = cv2.resize(frame, (640, 480))
            
            with self.frame_lock:
                self.current_frame = frame.copy()
            self.frame_count += 1
            
            time.sleep(frame_delay)


class WebcamStream(VideoStreamSource):
    """Stream from local webcam"""
    
    def __init__(self, device_index=0, fps=30):
        super().__init__("webcam0", "Local Webcam", fps)
        self.device_index = device_index
        self.cap = None
    
    def _try_open_webcam(self):
        """Try to open webcam in a separate thread with timeout"""
        try:
            # Set backend to DirectShow on Windows for faster failure
            cap = cv2.VideoCapture(self.device_index, cv2.CAP_DSHOW)
            if cap.isOpened():
                self.cap = cap
                self.connected = True
                print(f"[OK] Webcam opened: device {self.device_index}")
                
                # Start frame reading thread
                self.thread = threading.Thread(target=self._loop, daemon=True)
                self.thread.start()
            else:
                self.connected = False
                self.error_message = f"Cannot open webcam: device {self.device_index}"
                print(f"[WARN] {self.error_message}")
        except Exception as e:
            self.connected = False
            self.error_message = f"Webcam error: {e}"
            print(f"[ERROR] {self.error_message}")
    
    def start(self):
        """Start webcam stream with timeout protection"""
        self.running = True
        
        # Try to open webcam in a separate thread to avoid blocking
        open_thread = threading.Thread(target=self._try_open_webcam, daemon=True)
        open_thread.start()
        open_thread.join(timeout=3.0)  # Wait max 3 seconds
        
        if not self.connected:
            self.error_message = self.error_message or f"Webcam connection timeout: device {self.device_index}"
            print(f"[WARN] {self.error_message}")
    
    def stop(self):
        """Stop webcam stream"""
        self.running = False
        if self.cap:
            self.cap.release()
        super().stop()
        print("[OK] Webcam stopped")
    
    def _loop(self):
        """Read frames in loop"""
        frame_delay = 1.0 / self.fps
        
        while self.running:
            if not self.cap or not self.cap.isOpened():
                time.sleep(frame_delay)
                continue
            
            try:
                ret, frame = self.cap.read()
                
                if not ret:
                    time.sleep(0.1)
                    continue
                
                # Resize to standard size
                if frame.shape[1] != 640 or frame.shape[0] != 480:
                    frame = cv2.resize(frame, (640, 480))
                
                with self.frame_lock:
                    self.current_frame = frame.copy()
                self.frame_count += 1
                
            except Exception as e:
                print(f"[ERROR] Webcam read error: {e}")
            
            time.sleep(frame_delay)


class SimpleCameraServer:
    """Simple camera MJPEG server"""
    
    def __init__(self, port=9000, video_path="test_video.mp4", webcam_index=0):
        self.port = port
        self.http_server = None
        self.running = False
        
        # Initialize sources
        self.sources = {}
        self.sources["localvideo0"] = LocalVideoStream(video_path)
        self.sources["webcam0"] = WebcamStream(webcam_index)
    
    def start(self):
        """Start server and all sources"""
        global _server_instance
        _server_instance = self
        
        print("=" * 60)
        print("  Simple Camera MJPEG Server")
        print("=" * 60)
        print()
        
        # Start all sources
        print("Starting video sources...")
        for source in self.sources.values():
            source.start()
        
        self.running = True
        
        try:
            self.http_server = ThreadingHTTPServer(('0.0.0.0', self.port), CameraRequestHandler)
            
            print()
            print("=" * 60)
            print(f"  HTTP Server running on: http://localhost:{self.port}")
            print("=" * 60)
            print()
            print("Available streams:")
            for source_id, source in self.sources.items():
                print(f"  - {source.name}")
                print(f"    http://localhost:{self.port}/stream/{source_id}")
            
            print()
            print("Dashboard (check status):")
            print(f"  - http://localhost:{self.port}/")
            print()
            print("How to use in Camera AI Dashboard:")
            print("1. Open http://localhost:3000")
            print("2. Go to 'Cameras' page")
            print("3. Click 'Add Camera'")
            print("4. Select 'RTSP Stream' type")
            print(f"5. Enter URL: http://localhost:{self.port}/stream/localvideo0")
            print("6. Click 'Add Camera'")
            print()
            print("Press Ctrl+C to stop...")
            print("=" * 60)
            
            self.http_server.serve_forever()
            
        except KeyboardInterrupt:
            print("\nReceived stop signal")
            self.stop()
        except Exception as e:
            print(f"Server error: {e}")
            import traceback
            traceback.print_exc()
            self.stop()
    
    def stop(self):
        """Stop server and all sources"""
        print("\nStopping server...")
        self.running = False
        
        for source in self.sources.values():
            source.stop()
        
        if self.http_server:
            self.http_server.shutdown()
        
        print("Server stopped")


class CameraRequestHandler(BaseHTTPRequestHandler):
    """HTTP request handler"""
    
    def do_GET(self):
        """Handle GET requests"""
        
        server = _server_instance
        if not server:
            self.send_error(500, "Server not initialized")
            return
        
        # Dashboard
        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            
            html = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Camera Server Status</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: white;
            min-height: 100vh;
            padding: 30px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            text-align: center;
            margin-bottom: 40px;
            color: #4a90d9;
            font-size: 2.5em;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        }
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
            gap: 25px;
            margin-bottom: 40px;
        }
        .camera-card {
            background: rgba(255,255,255,0.08);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        .camera-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        .camera-name {
            font-size: 1.4em;
            font-weight: 600;
            color: #ffd700;
        }
        .status-badge {
            padding: 6px 16px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 0.9em;
        }
        .status-ok { background: #2ecc71; color: white; }
        .status-error { background: #e74c3c; color: white; }
        .stream-url {
            background: rgba(0,0,0,0.4);
            padding: 15px;
            border-radius: 10px;
            font-family: 'Courier New', monospace;
            font-size: 0.95em;
            word-break: break-all;
            margin-bottom: 15px;
            color: #4a90d9;
        }
        .status-info {
            margin: 10px 0;
            font-size: 0.95em;
        }
        .status-label {
            opacity: 0.7;
            margin-right: 8px;
        }
        img {
            width: 100%;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            margin-top: 15px;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            opacity: 0.6;
            font-size: 0.9em;
        }
        .refresh-info {
            text-align: center;
            margin: 15px 0;
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Camera Server Status</h1>
        <div class="refresh-info">Streams update automatically</div>
        <div class="status-grid">
"""
            
            for source_id, source in server.sources.items():
                status = source.get_status()
                status_class = "status-ok" if status['connected'] else "status-error"
                status_text = "Connected" if status['connected'] else "Disconnected"
                
                html += f"""
            <div class="camera-card">
                <div class="camera-header">
                    <div class="camera-name">{source.name}</div>
                    <div class="status-badge {status_class}">{status_text}</div>
                </div>
                <div class="stream-url">http://localhost:{server.port}/stream/{source_id}</div>
                <div class="status-info">
                    <span class="status-label">Frames received:</span> {status['frame_count']}
                </div>
"""
                if not status['connected'] and status['error']:
                    html += f"""
                <div class="status-info" style="color: #e74c3c; margin-top: 10px;">
                    <span class="status-label">Error:</span> {status['error']}
                </div>
"""
                html += f"""
                <img src="/stream/{source_id}" alt="{source.name}">
            </div>
"""
            
            html += """
        </div>
        <div class="footer">
            <p>Camera AI Dashboard - Simple Camera MJPEG Stream Server</p>
        </div>
    </div>
</body>
</html>
"""
            self.wfile.write(html.encode())
        
        # Stream endpoints
        elif self.path.startswith('/stream/'):
            source_id = self.path.split('/')[-1]
            source = server.sources.get(source_id)
            
            if not source:
                self.send_error(404, f"Stream {source_id} not found")
                return
            
            self.send_response(200)
            self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=frame')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            try:
                while server.running and source.running:
                    frame_bytes = source.get_frame_jpeg()
                    if frame_bytes:
                        self.wfile.write(b'--frame\r\n')
                        self.wfile.write(b'Content-Type: image/jpeg\r\n\r\n')
                        self.wfile.write(frame_bytes)
                        self.wfile.write(b'\r\n')
                        self.wfile.flush()
                    time.sleep(0.033)
            except Exception as e:
                pass
        
        # Snapshot endpoints
        elif self.path.startswith('/snapshot/'):
            source_id = self.path.split('/')[-1]
            source = server.sources.get(source_id)
            
            if not source:
                self.send_error(404, f"Stream {source_id} not found")
                return
            
            frame_bytes = source.get_frame_jpeg()
            if frame_bytes:
                self.send_response(200)
                self.send_header('Content-Type', 'image/jpeg')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(frame_bytes)
            else:
                self.send_error(500, "No frame available")
        
        else:
            self.send_error(404)
    
    def log_message(self, format, *args):
        """Quiet logging"""
        pass


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Simple Camera MJPEG Server")
    parser.add_argument("--port", "-p", help="HTTP server port (default: 9000)", type=int, default=9000)
    parser.add_argument("--video", "-v", help="Video file path (default: test_video.mp4)", default="test_video.mp4")
    parser.add_argument("--webcam", "-w", help="Webcam device index (default: 0)", type=int, default=0)
    
    args = parser.parse_args()
    
    # Check if video file exists
    if not os.path.isabs(args.video):
        video_path = os.path.join(os.path.dirname(__file__), args.video)
    else:
        video_path = args.video
    
    if not os.path.exists(video_path):
        print(f"[WARN] Video file not found: {video_path}")
        print("       Local video stream will not be available.")
    
    server = SimpleCameraServer(
        port=args.port,
        video_path=video_path,
        webcam_index=args.webcam
    )
    server.start()


if __name__ == "__main__":
    main()