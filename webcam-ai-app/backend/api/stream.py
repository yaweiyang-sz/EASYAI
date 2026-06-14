from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import asyncio
import cv2
import numpy as np
from services.camera_service import camera_service

router = APIRouter(prefix="/api/stream", tags=["stream"])


async def generate_frames(camera_id: str, use_ai: bool = False, ai_service_url: str = None):
    while True:
        try:
            frame = await camera_service.get_frame(camera_id, timeout=1.0)
            
            if frame is None:
                frame = await camera_service.get_test_frame(camera_id)
            
            frame = camera_service.resize_frame(frame)

            if use_ai and ai_service_url:
                try:
                    import httpx
                    _, buffer = cv2.imencode('.jpg', frame)
                    async with httpx.AsyncClient(timeout=5.0) as client:
                        response = await client.post(
                            f"{ai_service_url}/process",
                            files={"image": ("frame.jpg", buffer.tobytes(), "image/jpeg")},
                            params={"camera_id": camera_id}
                        )
                    if response.status_code == 200:
                        result = response.json()
                        if result.get("annotated_frame"):
                            import base64
                            annotated_data = base64.b64decode(result["annotated_frame"])
                            frame = cv2.imdecode(
                                np.frombuffer(annotated_data, np.uint8),
                                cv2.IMREAD_COLOR
                            )
                except Exception as e:
                    print(f"AI processing error: {e}")

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
async def stream_video(camera_id: str, use_ai: bool = False, ai_url: str = None):
    camera = await camera_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    await camera_service.start_stream(camera_id)

    return StreamingResponse(
        generate_frames(camera_id, use_ai, ai_url),
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