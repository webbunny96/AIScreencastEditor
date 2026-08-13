"""
AI Screencast Editor - FastAPI Backend
Main application entry point
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import settings
from api.upload import router as upload_router
from api.process import router as process_router
from api.export import router as export_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    # Startup: ensure directories exist
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.EXPORT_DIR, exist_ok=True)
    yield
    # Shutdown: cleanup if needed
    pass


def create_app() -> FastAPI:
    """Factory function to create and configure the FastAPI application"""
    app = FastAPI(
        title="AI Screencast Editor",
        description="Automated video editing with AI-powered transcription and semantic filtering",
        version="1.0.0",
        lifespan=lifespan
    )
    
    # CORS configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Include routers
    app.include_router(upload_router, prefix="/api/upload", tags=["Upload"])
    app.include_router(process_router, prefix="/api/process", tags=["Process"])
    app.include_router(export_router, prefix="/api/export", tags=["Export"])
    
    # Health check endpoint
    @app.get("/api/health")
    async def health_check():
        return {"status": "healthy", "version": "1.0.0"}
    
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)