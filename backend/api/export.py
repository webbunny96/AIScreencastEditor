"""
Video Export API Endpoints
Handles video rendering and progress tracking
"""

import os
import asyncio
from typing import Optional, Dict
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
import json
import time

from config import settings
from api.upload import job_store
from services.video_renderer import VideoRendererService, ExportConfig, render_video


router = APIRouter()

# Export tracking store
export_store: Dict[str, dict] = {}

# SSE subscribers for progress updates
sse_subscribers: Dict[str, list] = {}


class ExportSettings(BaseModel):
    resolution: str = "original"  # original, 1080p, 720p
    codec: str = "libx264"  # libx264, libx265
    crf: int = 23  # 18 (high), 23 (medium), 28 (low)
    framerate: str = "original"  # original, 30, 60


class EDLSegment(BaseModel):
    id: int
    start: float
    end: float
    text: str
    keep: bool


class ExportRequest(BaseModel):
    job_id: str
    segments: list[EDLSegment]
    settings: ExportSettings


class ExportResponse(BaseModel):
    export_id: str
    job_id: str
    status: str
    message: str
    download_url: Optional[str] = None


@router.post("/", response_model=ExportResponse)
async def start_export(request: ExportRequest):
    """
    Start video export process.
    Renders video based on EDL segments and export settings.
    """
    # Validate job exists
    if request.job_id not in job_store:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = job_store[request.job_id]
    input_path = job.get("original_path")
    
    if not input_path or not os.path.exists(input_path):
        raise HTTPException(status_code=400, detail="Source video not found")
    
    # Check if there are any segments to export
    kept_segments = [s for s in request.segments if s.keep]
    if not kept_segments:
        raise HTTPException(status_code=400, detail="No segments selected for export")
    
    # Generate export ID
    export_id = f"export_{int(time.time())}"
    
    # Store export status
    export_store[export_id] = {
        "job_id": request.job_id,
        "status": "processing",
        "progress": 0,
        "started_at": time.time(),
        "settings": request.settings.dict(),
        "output_path": None,
        "error": None,
    }
    
    # Start export in background
    asyncio.create_task(
        process_export(
            export_id,
            request.job_id,
            [s.dict() for s in request.segments],
            request.settings,
            input_path
        )
    )
    
    return ExportResponse(
        export_id=export_id,
        job_id=request.job_id,
        status="processing",
        message="Export started. Check progress via SSE endpoint.",
        download_url=None
    )


async def process_export(
    export_id: str,
    job_id: str,
    segments: list,
    settings_dict: ExportSettings,
    input_path: str
):
    """Background task to process video export"""
    try:
        # Create export config
        config = ExportConfig(
            resolution=settings_dict.resolution,
            codec=settings_dict.codec,
            crf=settings_dict.crf,
            framerate=settings_dict.framerate
        )
        
        # Render video
        export_id_result, output_path = await render_video(segments, input_path, config)
        
        # Update status
        export_store[export_id]["status"] = "completed"
        export_store[export_id]["progress"] = 100
        export_store[export_id]["output_path"] = output_path
        export_store[export_id]["completed_at"] = time.time()
        
        # Notify SSE subscribers
        broadcast_progress(export_id, 100, "completed")
        
    except Exception as e:
        # Update status on error
        export_store[export_id]["status"] = "failed"
        export_store[export_id]["error"] = str(e)
        
        # Notify SSE subscribers
        broadcast_progress(export_id, 0, "failed", str(e))


def broadcast_progress(export_id: str, progress: int, status: str, error: Optional[str] = None):
    """Send progress update to SSE subscribers"""
    if export_id in sse_subscribers:
        message = {
            "export_id": export_id,
            "progress": progress,
            "status": status,
            "error": error,
            "timestamp": time.time()
        }
        for queue in sse_subscribers[export_id]:
            queue.put(message)


@router.get("/{export_id}/progress")
async def get_export_progress(export_id: str):
    """
    Get export progress via Server-Sent Events.
    Returns progress updates from 0% to 100%.
    """
    if export_id not in export_store:
        raise HTTPException(status_code=404, detail="Export not found")
    
    async def event_generator():
        # Create a queue for this subscriber
        from asyncio import Queue
        queue = Queue()
        
        if export_id not in sse_subscribers:
            sse_subscribers[export_id] = []
        sse_subscribers[export_id].append(queue)
        
        try:
            # Send initial status
            export_info = export_store[export_id]
            yield f"data: {json.dumps(export_info)}\n\n"
            
            # Keep connection open and send updates
            while True:
                try:
                    # Wait for update with timeout
                    update = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(update)}\n\n"
                    
                    # If completed or failed, close connection
                    if update.get("status") in ["completed", "failed"]:
                        break
                except asyncio.TimeoutError:
                    # Send keepalive
                    yield ": heartbeat\n\n"
                    
        finally:
            # Clean up subscriber
            if export_id in sse_subscribers and queue in sse_subscribers[export_id]:
                sse_subscribers[export_id].remove(queue)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.get("/download/{export_id}")
async def download_export(export_id: str):
    """
    Download the exported video file.
    """
    if export_id not in export_store:
        raise HTTPException(status_code=404, detail="Export not found")
    
    export = export_store[export_id]
    
    if export["status"] != "completed":
        raise HTTPException(status_code=400, detail="Export not completed")
    
    file_path = export.get("output_path")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(
        path=file_path,
        filename=f"export_{export_id}.mp4",
        media_type="video/mp4",
        headers={
            "Content-Disposition": f"attachment; filename=export_{export_id}.mp4"
        }
    )


@router.get("/status/{export_id}")
async def get_export_status(export_id: str):
    """Get current export status (non-streaming)"""
    if export_id not in export_store:
        raise HTTPException(status_code=404, detail="Export not found")
    
    return export_store[export_id]


@router.delete("/{export_id}")
async def cancel_export(export_id: str):
    """Cancel an export (cleanup)"""
    if export_id not in export_store:
        raise HTTPException(status_code=404, detail="Export not found")
    
    export = export_store[export_id]
    
    # Clean up output file if exists
    if export.get("output_path") and os.path.exists(export["output_path"]):
        try:
            os.remove(export["output_path"])
        except OSError:
            pass
    
    # Remove from store
    del export_store[export_id]
    
    return {"status": "cancelled", "message": "Export cleaned up"}