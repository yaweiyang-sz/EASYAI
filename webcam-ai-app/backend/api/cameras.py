from fastapi import APIRouter, HTTPException
from typing import List
from models import Camera, CameraCreate, CameraUpdate
from services.camera_service import camera_service

router = APIRouter(prefix="/api/cameras", tags=["cameras"])

@router.get("/devices/")
async def list_devices():
    """List available camera devices"""
    try:
        devices = camera_service.enumerate_devices()
        return {"devices": devices}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to enumerate devices: {str(e)}")

@router.post("/", response_model=Camera, status_code=201)
async def add_camera(camera: CameraCreate):
    return await camera_service.add_camera(camera)

@router.get("/", response_model=List[Camera])
async def list_cameras():
    return await camera_service.list_cameras()

@router.get("/{camera_id}", response_model=Camera)
async def get_camera(camera_id: str):
    camera = await camera_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    return camera

@router.delete("/{camera_id}", status_code=204)
async def delete_camera(camera_id: str):
    deleted = await camera_service.delete_camera(camera_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Camera not found")

@router.patch("/{camera_id}", response_model=Camera)
async def update_camera(camera_id: str, update_data: CameraUpdate):
    camera = await camera_service.update_camera(camera_id, update_data)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    return camera
