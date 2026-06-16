"""
WebSocket-based Camera Stream Module
- Frame grabber and AI caller tasks are persistent (not killed on last disconnect)
- Multiple WebSocket clients share one set of tasks per camera
- Algorithm calls throttled to 2 Hz
"""

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, Response
import asyncio
import cv2
import numpy as np
import httpx
import base64
import json
import time
from typing import Dict, Set, Optional
from services.camera_service import camera_service

router = APIRouter(prefix="/api/stream", tags=["stream"])

# =============================================================================
# Per-camera shared state (persistent — never cleaned up on idle)
# =============================================================================
class CameraStreamState:
    def __init__(self):
        self.latest_frame: Optional[np.ndarray] = None
        self.latest_jpeg_bytes: Optional[bytes] = None
        self.latest_frame_ts: float = 0.0
        self.latest_detections: list = []
        self.latest_annotated_frame_b64: Optional[str] = None
        self.frame_task: Optional[asyncio.Task] = None
        self.algo_task: Optional[asyncio.Task] = None
        self.connections: Set[WebSocket] = set()

stream_states: Dict[str, CameraStreamState] = {}
detection_results: Dict[str, dict] = {}
ALGO_CALL_INTERVAL = 0.5  # 2 Hz


def get_enabled_algorithms(camera):
    if not camera or not camera.algorithms:
        return []
    return [algo for algo in camera.algorithms if algo.enabled]


async def call_ai_service(frame: np.ndarray, camera_id: str, algorithm) -> Optional[dict]:
    ai_service_url = "http://ai-service:8001/api/process"
    try:
        _, buffer = cv2.imencode('.jpg', frame)
        params = {"camera_id": camera_id, "algorithm": algorithm.algorithm_type, "confidence": algorithm.confidence}
        if algorithm.classes:
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


# =============================================================================
# Persistent Frame Grabber — never stopped, just sleeps when idle
# =============================================================================
async def frame_grabber_task(camera_id: str):
    state = stream_states.get(camera_id)
    if not state:
        return

    print(f"[INFO] Frame grabber started for camera {camera_id}")

    while True:
        if not state.connections:
            await asyncio.sleep(0.5)
            continue

        try:
            frame = await camera_service.get_frame(camera_id, timeout=1.0)
            if frame is None:
                frame = await camera_service.get_test_frame(camera_id)
            frame = camera_service.resize_frame(frame)
            state.latest_frame = frame.copy()
            state.latest_frame_ts = time.time()

            _, jpeg_bytes = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            state.latest_jpeg_bytes = jpeg_bytes.tobytes()

            message = {
                "type": "frame",
                "camera_id": camera_id,
                "frame": base64.b64encode(state.latest_jpeg_bytes).decode('utf-8'),
                "timestamp": state.latest_frame_ts
            }
            if state.latest_detections:
                message["detections"] = list(state.latest_detections)
            if state.latest_annotated_frame_b64:
                message["annotated_frame"] = state.latest_annotated_frame_b64

            await broadcast_to_clients(state, json.dumps(message))
        except Exception as e:
            print(f"[ERROR] Frame grabber error for camera {camera_id}: {e}")
            await asyncio.sleep(1.0)
            continue

        await asyncio.sleep(0.033)


async def broadcast_to_clients(state: CameraStreamState, message_json: str):
    if not state.connections:
        return

    async def send_to_one(ws: WebSocket):
        try:
            await asyncio.wait_for(ws.send_text(message_json), timeout=2.0)
            return ws, None
        except Exception as e:
            return ws, e

    tasks = [send_to_one(ws) for ws in list(state.connections)]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, tuple):
            ws, err = result
            if err is not None:
                state.connections.discard(ws)


# =============================================================================
# Persistent AI Caller — never stopped
# =============================================================================
async def algo_caller_task(camera_id: str):
    state = stream_states.get(camera_id)
    if not state:
        return

    print(f"[INFO] Algorithm caller started for camera {camera_id}")
    last_call_time = 0.0

    while True:
        camera = await camera_service.get_camera(camera_id)
        enabled_algos = get_enabled_algorithms(camera) if camera else []

        if not enabled_algos:
            state.latest_detections = []
            state.latest_annotated_frame_b64 = None
            await asyncio.sleep(1.0)
            continue

        now = time.time()
        if now - last_call_time >= ALGO_CALL_INTERVAL:
            last_call_time = now

            frame_copy = None
            if state.latest_frame is not None:
                frame_copy = state.latest_frame.copy()

            if frame_copy is not None:
                all_detections = []
                annotated_b64 = None
                for algo in enabled_algos:
                    result = await call_ai_service(frame_copy, camera_id, algo)
                    if result:
                        if result.get("annotated_frame"):
                            annotated_b64 = result["annotated_frame"]
                        if result.get("detections"):
                            all_detections.extend(result["detections"])

                state.latest_detections = all_detections
                state.latest_annotated_frame_b64 = annotated_b64

                if all_detections:
                    detection_results[camera_id] = {"detections": all_detections, "timestamp": now}
                elif camera_id in detection_results:
                    del detection_results[camera_id]

        await asyncio.sleep(0.1)


# =============================================================================
# Persistence helpers
# =============================================================================
async def ensure_tasks_running(camera_id: str):
    if camera_id not in stream_states:
        stream_states[camera_id] = CameraStreamState()

    state = stream_states[camera_id]

    if state.frame_task is None or state.frame_task.done():
        state.frame_task = asyncio.create_task(frame_grabber_task(camera_id))

    if state.algo_task is None or state.algo_task.done():
        state.algo_task = asyncio.create_task(algo_caller_task(camera_id))


async def stop_tasks(camera_id: str):
    state = stream_states.pop(camera_id, None)
    if not state:
        return
    for task in (state.frame_task, state.algo_task):
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    print(f"[INFO] Stopped tasks for camera {camera_id}")


# =============================================================================
# WebSocket Endpoint
# =============================================================================
@router.websocket("/{camera_id}/ws")
async def websocket_stream(websocket: WebSocket, camera_id: str):
    await websocket.accept()

    camera = await camera_service.get_camera(camera_id)
    if not camera:
        await websocket.close(code=1008, reason="Camera not found")
        return

    # Ensure stream is active (no-op if already connected)
    await camera_service.start_stream(camera_id)

    # Ensure async tasks are running (no-op if already running)
    await ensure_tasks_running(camera_id)

    state = stream_states[camera_id]
    state.connections.add(websocket)

    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                try:
                    msg = json.loads(data)
                    if msg.get("type") == "ping":
                        await websocket.send_text(json.dumps({"type": "pong"}))
                except json.JSONDecodeError:
                    pass
            except asyncio.TimeoutError:
                try:
                    await websocket.send_text(json.dumps({"type": "ping"}))
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        state.connections.discard(websocket)
        # Tasks keep running — no cleanup on last disconnect


# =============================================================================
# HTTP Endpoints (backward compatibility)
# =============================================================================
@router.get("/{camera_id}")
async def stream_video(camera_id: str):
    camera = await camera_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    await camera_service.start_stream(camera_id)

    async def gen():
        while True:
            try:
                frame = await camera_service.get_frame(camera_id, timeout=1.0)
                if frame is None:
                    frame = await camera_service.get_test_frame(camera_id)
                frame = camera_service.resize_frame(frame)
                ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                if not ret:
                    await asyncio.sleep(0.033)
                    continue
                yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            except Exception:
                await asyncio.sleep(1.0)
            await asyncio.sleep(0.033)

    return StreamingResponse(gen(), media_type="multipart/x-mixed-replace; boundary=frame")


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
    return Response(content=buffer.tobytes(), media_type="image/jpeg")


@router.get("/{camera_id}/status")
async def get_stream_status(camera_id: str):
    camera = await camera_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    return {"camera_id": camera_id, "status": await camera_service.get_connection_status(camera_id)}


@router.get("/{camera_id}/events")
async def stream_events(camera_id: str):
    camera = await camera_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    async def gen():
        last_ts = 0
        while True:
            await asyncio.sleep(0.1)
            result = detection_results.get(camera_id)
            if result and result["timestamp"] > last_ts:
                last_ts = result["timestamp"]
                yield f"data: {json.dumps(result)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.get("/{camera_id}/detections")
async def get_detections(camera_id: str):
    camera = await camera_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    result = detection_results.get(camera_id, {})
    return {"camera_id": camera_id, "detections": result.get("detections", []), "timestamp": result.get("timestamp", 0)}