from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
import asyncio
import cv2
import numpy as np
import httpx
import base64
from services.camera_service import camera_service

router = APIRouter(prefix="/api/stream", tags=["stream"])

detection_results = {}


def get_enabled_algorithms(camera):
    if not camera or not camera.algorithms:
        return []
    return [algo for algo in camera.algorithms if algo.enabled]


async def call_ai_service(frame, camera_id, algorithm):
    ai_service_url = "http://ai-service:8001/api/process"
    
    try:
        _, buffer = cv2.imencode('.jpg', frame)
        
        params = {
            "camera_id": camera_id,
            "algorithm": algorithm.algorithm_type,
            "confidence": algorithm.confidence
        }
        
        if algorithm.classes and len(algorithm.classes) > 0:
            params["classes"] = ",".join(algorithm.classes)
        
        if algorithm.roi:
            params["roi_x1"] = algorithm.roi.x1
            params["roi_y1"] = algorithm.roi.y1
            params["roi_x2"] = algorithm.roi.x2
            params["roi_y2"] = algorithm.roi.y2
        
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                ai_service_url,
                files={"image": ("frame.jpg", buffer.tobytes(), "image/jpeg")},
                params=params
            )
        
        if response.status_code == 200:
            return response.json()
        
    except Exception as e:
        print(f"AI service call error: {e}")
    
    return None


async def generate_frames(camera_id: str):
    global detection_results
    
    while True:
        try:
            frame = await camera_service.get_frame(camera_id, timeout=1.0)
            
            if frame is None:
                frame = await camera_service.get_test_frame(camera_id)
            
            frame = camera_service.resize_frame(frame)

            camera = await camera_service.get_camera(camera_id)
            enabled_algos = get_enabled_algorithms(camera)
            
            latest_detections = []
            
            for algo in enabled_algos:
                result = await call_ai_service(frame, camera_id, algo)
                if result:
                    if result.get("annotated_frame"):
                        annotated_data = base64.b64decode(result["annotated_frame"])
                        frame = cv2.imdecode(
                            np.frombuffer(annotated_data, np.uint8),
                            cv2.IMREAD_COLOR
                        )
                    
                    if result.get("detections") and len(result["detections"]) > 0:
                        latest_detections.extend(result["detections"])

            if latest_detections:
                detection_results[camera_id] = {
                    "detections": latest_detections,
                    "timestamp": asyncio.get_event_loop().time()
                }
            elif camera_id in detection_results:
                del detection_results[camera_id]

            ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if not ret:
                await asyncio.sleep(0.033)
                continue

            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

        except Exception as e:
            print(f"Stream error: {e}")
            await asyncio.sleep(1.0)
            continue

        await asyncio.sleep(0.033)


@router.get("/{camera_id}")
async def stream_video(camera_id: str):
    camera = await camera_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    await camera_service.start_stream(camera_id)

    return StreamingResponse(
        generate_frames(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@router.get("/{camera_id}/snapshot")
async def get_snapshot(camera_id: str):
    camera = await camera_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    frame = await camera_service.get_frame(camera_id, timeout=2.0)
    
    if frame is None:
        frame = await camera_service.get_test_frame(camera_id)

    frame = camera_service.resize_frame(frame)
    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])

    from fastapi.responses import Response
    return Response(content=buffer.tobytes(), media_type="image/jpeg")


@router.get("/{camera_id}/status")
async def get_stream_status(camera_id: str):
    camera = await camera_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    status = await camera_service.get_connection_status(camera_id)
    return {"camera_id": camera_id, "status": status}


async def event_stream(camera_id: str):
    last_timestamp = 0
    
    while True:
        await asyncio.sleep(0.1)
        
        result = detection_results.get(camera_id)
        if result and result["timestamp"] > last_timestamp:
            last_timestamp = result["timestamp"]
            import json
            message = json.dumps({
                "camera_id": camera_id,
                "detections": result["detections"],
                "timestamp": result["timestamp"]
            })
            yield f"data: {message}\n\n"


@router.get("/{camera_id}/events")
async def stream_events(camera_id: str):
    camera = await camera_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    return StreamingResponse(
        event_stream(camera_id),
        media_type="text/event-stream"
    )


@router.get("/{camera_id}/detections")
async def get_detections(camera_id: str):
    camera = await camera_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    result = detection_results.get(camera_id, {})
    return {
        "camera_id": camera_id,
        "detections": result.get("detections", []),
        "timestamp": result.get("timestamp", 0)
    }