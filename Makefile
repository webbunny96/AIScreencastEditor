.PHONY: help install-backend install-frontend install dev-backend dev-frontend dev clean test

help:
	@echo "AI Screencast Editor - Available Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install-backend    Install Python dependencies"
	@echo "  make install-frontend   Install Node dependencies"
	@echo "  make install            Install all dependencies"
	@echo ""
	@echo "Development:"
	@echo "  make dev-backend        Start backend server"
	@echo "  make dev-frontend       Start frontend dev server"
	@echo "  make dev                Start both backend and frontend"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean              Remove build artifacts"
	@echo "  make test               Run tests"

install-backend:
	cd backend && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt

install-frontend:
	cd frontend && npm install

install: install-backend install-frontend

dev-backend:
	cd backend && source venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000

dev-frontend:
	cd frontend && npm run dev

dev:
	@echo "Starting backend and frontend..."
	@echo "Backend: http://localhost:8000"
	@echo "Frontend: http://localhost:5173"
	@echo ""
	@echo "Press Ctrl+C to stop all servers"
	@# On Windows, you might need to use separate terminals
	@# For simplicity, we'll just show the commands
	@echo ""
	@echo "Run these commands in separate terminals:"
	@echo "  Terminal 1: make dev-backend"
	@echo "  Terminal 2: make dev-frontend"

clean:
	rm -rf backend/__pycache__
	rm -rf backend/api/__pycache__
	rm -rf backend/services/__pycache__
	rm -rf backend/venv
	rm -rf frontend/node_modules
	rm -rf frontend/dist
	rm -rf build
	rm -rf dist
	rm -rf *.egg-info
	find . -name "*.pyc" -delete
	find . -name "__pycache__" -delete

test:
	@echo "Running tests..."
	@# Add test commands here when tests are implemented
	@echo "No tests implemented yet."