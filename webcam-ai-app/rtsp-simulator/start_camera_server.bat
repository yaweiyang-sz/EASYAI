@echo off
echo ============================================================
echo   Simple Camera MJPEG Server
echo ============================================================
echo.
echo   Available streams:
echo   - http://localhost:9000/stream/localvideo0
echo   - http://localhost:9000/stream/webcam0
echo.
echo   Dashboard: http://localhost:9000/
echo.
echo   Press Ctrl+C to stop the server
echo ============================================================
echo.

cd /d "%~dp0"
python camera_server.py