import cv2
import numpy as np
import time
import subprocess
import os

def generate_test_frame(frame_num):
    height, width = 480, 640
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    
    cv2.putText(frame, f"Test Camera Feed", (50, 50), 
                cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 255, 0), 3)
    cv2.putText(frame, f"Frame: {frame_num}", (50, 100), 
                cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
    cv2.putText(frame, f"Time: {time.strftime('%H:%M:%S')}", (50, 140), 
                cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
    
    center_x, center_y = width // 2, height // 2
    radius = int(50 + 30 * np.sin(frame_num * 0.1))
    color = (0, 0, 255) if frame_num % 2 == 0 else (0, 255, 255)
    cv2.circle(frame, (center_x, center_y), radius, color, -1)
    
    for i in range(4):
        angle = (frame_num * 0.05) + (i * np.pi / 2)
        x = int(center_x + 150 * np.cos(angle))
        y = int(center_y + 100 * np.sin(angle))
        cv2.circle(frame, (x, y), 15, (255, 0, 0), -1)
    
    return frame

def main():
    rtsp_url = os.environ.get('RTSP_URL', 'rtsp://rtsp-server:8554/camera1')
    
    print(f"Starting RTSP stream to: {rtsp_url}")
    
    pipeline = [
        'appsrc', 'is-live=true', 'do-timestamp=true', 
        'caps=video/x-raw,format=BGR,width=640,height=480,framerate=15/1',
        '!', 'videoconvert',
        '!', 'x264enc', 'speed-preset=ultrafast', 'tune=zerolatency',
        '!', 'rtph264pay',
        '!', 'udpsink', 'host=rtsp-server', 'port=5000'
    ]
    
    command = ['gst-launch-1.0'] + pipeline
    
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    
    frame_num = 0
    try:
        while True:
            frame = generate_test_frame(frame_num)
            frame_num += 1
            
            process.stdin.write(frame.tobytes())
            process.stdin.flush()
            
            time.sleep(1 / 15)
            
    except KeyboardInterrupt:
        print("Stopping stream...")
    finally:
        process.stdin.close()
        process.wait()

if __name__ == "__main__":
    time.sleep(5)
    main()
