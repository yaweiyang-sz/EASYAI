#!/bin/bash

# Camera AI - Production Deployment Script (Linux/Mac)

set -e

echo "============================================================"
echo "  Camera AI - Production Deployment Script"
echo "============================================================"
echo ""

# Step 1: Build frontend
echo "Step 1: Building frontend..."
cd "$(dirname "$0")/frontend"
npm run build
echo "[OK] Frontend built successfully"
echo ""

# Step 2: Build Docker images
echo "Step 2: Building Docker images..."
cd "$(dirname "$0")"
docker-compose -f docker-compose.prod.yml build
echo "[OK] Docker images built successfully"
echo ""

# Step 3: Start services with Docker Compose
echo "Step 3: Starting services with Docker Compose..."
docker-compose -f docker-compose.prod.yml up -d
echo "[OK] Services started"
echo ""

echo "============================================================"
echo "  Deployment Complete!"
echo "============================================================"
echo ""
echo "  Access the application at: http://localhost:3000"
echo ""
echo "  Available services:"
echo "  - Frontend (nginx):  http://localhost:3000"
echo "  - Backend API:       http://localhost:8000"
echo "  - AI Service:        http://localhost:8001"
echo ""
echo "  To stop services:"
echo "  docker-compose -f docker-compose.prod.yml down"
echo ""