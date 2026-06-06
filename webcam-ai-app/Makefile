.PHONY: help build up down restart logs logs-backend logs-ai logs-frontend status clean

help:
	@echo "Camera AI Dashboard - Docker Commands"
	@echo ""
	@echo "Usage:"
	@echo "  make build       - Build all Docker images"
	@echo "  make up          - Start all services"
	@echo "  make down        - Stop all services"
	@echo "  make restart     - Restart all services"
	@echo "  make logs        - View all logs"
	@echo "  make logs-backend   - View backend logs"
	@echo "  make logs-ai        - View AI service logs"
	@echo "  make logs-frontend  - View frontend logs"
	@echo "  make status      - Show container status"
	@echo "  make clean       - Remove all containers and volumes"

build:
	docker-compose build

up:
	docker-compose up -d

down:
	docker-compose down

restart:
	docker-compose restart

logs:
	docker-compose logs -f

logs-backend:
	docker-compose logs -f backend

logs-ai:
	docker-compose logs -f ai-service

logs-frontend:
	docker-compose logs -f frontend

status:
	docker-compose ps

clean:
	docker-compose down -v --remove-orphans
	docker rmi $$(docker images -q -f reference='camera-ai-*' 2>/dev/null) 2>/dev/null || true

gpu-build:
	docker-compose -f docker-compose.gpu.yml build

gpu-up:
	docker-compose -f docker-compose.gpu.yml up -d

gpu-down:
	docker-compose -f docker-compose.gpu.yml down

gpu-restart:
	docker-compose -f docker-compose.gpu.yml restart

gpu-logs:
	docker-compose -f docker-compose.gpu.yml logs -f
