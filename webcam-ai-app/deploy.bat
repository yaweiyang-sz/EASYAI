@echo off
echo ============================================================
echo   Camera AI - Production Deployment Script
echo ============================================================
echo.

echo Step 1: Building frontend...
cd /d "%~dp0frontend"
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed!
    pause
    exit /b 1
)
echo [OK] Frontend built successfully
echo.

echo Step 2: Building Docker images...
cd /d "%~dp0"
docker-compose -f docker-compose.prod.yml build
if errorlevel 1 (
    echo [ERROR] Docker build failed!
    pause
    exit /b 1
)
echo [OK] Docker images built successfully
echo.

echo Step 3: Starting services with Docker Compose...
docker-compose -f docker-compose.prod.yml up -d
if errorlevel 1 (
    echo [ERROR] Docker startup failed!
    pause
    exit /b 1
)
echo [OK] Services started
echo.

echo ============================================================
echo   Deployment Complete!
echo ============================================================
echo.
echo   Access the application at: http://localhost:3000
echo.
echo   Available services:
echo   - Frontend (nginx):  http://localhost:3000
echo   - Backend API:       http://localhost:8000
echo   - AI Service:        http://localhost:8001
echo.
echo   To stop services:
echo   docker-compose -f docker-compose.prod.yml down
echo.
pause