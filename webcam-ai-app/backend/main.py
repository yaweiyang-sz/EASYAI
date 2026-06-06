from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.cameras import router as cameras_router
from api.stream import router as stream_router

app = FastAPI(title="Camera AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cameras_router)
app.include_router(stream_router)

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "camera-ai-backend"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
