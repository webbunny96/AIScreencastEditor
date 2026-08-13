"""
Video Upload API Endpoint
Handles file upload, validation, and audio extraction
"""

import os
import uuid
import subprocess
import asyncio
import shutil
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from config import settings


def find_ffmpeg() -> str:
    """Find ffmpeg executable, checking PATH and common install locations"""
    # Check PATH first
    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path:
        return ffmpeg_path
    
    # Check common Windows install locations
    common_paths = [
        # WinGet install location
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0-full_build\bin\ffmpeg.exe"),
        # Chocolatey
        r"C:\ProgramData\chocolatey\bin\ffmpeg.exe",
        # Manual installs
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
    ]
    
    for path in common_paths:
        if os.path.exists(path):
            return path
    
    raise RuntimeError("FFmpeg not found. Please install FFmpeg and add it to PATH.")


router = APIRouter()


class UploadResponse(BaseModel):
    job_id: str
    filename: str
    filepath: str
    audio_extracted: bool
    message: str


class JobStatus(BaseModel):
    job_id: str
    status: str  # pending, processing, completed, failed
    progress: Optional[float] = None
    error: Optional[str] = None


# In-memory job tracking (will be replaced with SQLite in Phase 2.3)
job_store = {}


ALLOWED_EXTENSIONS = {".mp4", ".mkv", ".mov", ".avi", ".webm", ".mov"}
MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024  # 2GB


def validate_file(file: UploadFile) -> tuple[bool, str]:
    """Validate uploaded file extension and size"""
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"File extension '{ext}' not allowed. Allowed: {ALLOWED_EXTENSIONS}"
    return True, ""


def extract_audio(job_id: str, input_path: str, output_path: str):
    """Extract audio from video file using FFmpeg"""
    try:
        # Find ffmpeg executable
        ffmpeg_path = find_ffmpeg()
        
        # Extract audio as 16kHz mono WAV for Whisper
        cmd = [
            ffmpeg_path,
            "-i", input_path,
            "-vn",  # No video
            "-acodec", "pcm_s16le",  # PCM 16-bit little endian
            "-ar", "16000",  # 16kHz sample rate
            "-ac", "1",  # Mono
            "-y",  # Overwrite output
            output_path
        ]
        
        import subprocess
        result = subprocess.run(cmd, capture_output=True)
        
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg error: {result.stderr.decode()}")
        
        # Verify audio file was created
        if not os.path.exists(output_path):
            raise RuntimeError("Audio extraction completed but output file not found")
        
        # Mark job as completed after successful extraction
        job_store[job_id]["status"] = "completed"
        
        return True
    except Exception as e:
        job_store[job_id]["status"] = "failed"
        job_store[job_id]["error"] = str(e)
        return False


@router.post("/")
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Video file to upload")
) -> UploadResponse:
    """
    Upload a video file for processing.
    Accepts .mp4, .mkv, .mov, .avi, .webm files.
    Extracts audio for Whisper transcription.
    """
    # Validate file
    is_valid, error_msg = validate_file(file)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    # Generate unique job ID and directory
    job_id = str(uuid.uuid4())
    upload_dir = os.path.abspath(os.path.join(settings.UPLOAD_DIR, job_id))
    os.makedirs(upload_dir, exist_ok=True)
    
    # Save uploaded file
    ext = os.path.splitext(file.filename)[1].lower()
    original_path = os.path.join(upload_dir, f"original{ext}")
    
    try:
        with open(original_path, "wb") as buffer:
            content = await file.read()
            if len(content) > MAX_FILE_SIZE:
                raise HTTPException(status_code=413, detail="File too large (max 2GB)")
            buffer.write(content)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Extract audio
    audio_path = os.path.join(upload_dir, "audio.wav")
    
    # Store job status
    job_store[job_id] = {
        "status": "processing",
        "original_path": original_path,
        "audio_path": audio_path,
        "filename": file.filename
    }
    
    # Run audio extraction in background
    background_tasks.add_task(extract_audio, job_id, original_path, audio_path)
    
    return UploadResponse(
        job_id=job_id,
        filename=file.filename,
        filepath=original_path,
        audio_extracted=False,  # Will be true after background task completes
        message="Video uploaded successfully. Audio extraction in progress."
    )


@router.get("/{job_id}/status")
async def get_upload_status(job_id: str) -> JobStatus:
    """Get the status of an upload job"""
    if job_id not in job_store:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = job_store[job_id]
    return JobStatus(
        job_id=job_id,
        status=job["status"],
        error=job.get("error")
    )


@router.get("/{job_id}/audio")
async def get_audio_path(job_id: str):
    """Get the path to the extracted audio file"""
    if job_id not in job_store:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = job_store[job_id]
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="Audio not yet extracted")
    
    return {"audio_path": job["audio_path"], "exists": os.path.exists(job["audio_path"])}


@router.get("/{job_id}/video")
async def get_video_file(job_id: str):
    """
    Stream the original video file for playback in the browser.
    Supports HTTP Range requests for seeking.
    """
    if job_id not in job_store:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = job_store[job_id]
    video_path = job.get("original_path")
    
    if not video_path or not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video file not found")
    
    # Get filename with proper extension for Content-Type detection
    filename = os.path.basename(video_path)
    ext = os.path.splitext(filename)[1].lower()
    
    # Determine media type
    media_type = "video/mp4"
    if ext == ".webm":
        media_type = "video/webm"
    elif ext == ".mkv":
        media_type = "video/x-matroska"
    elif ext == ".mov":
        media_type = "video/quicktime"
    elif ext == ".avi":
        media_type = "video/x-msvideo"
    
    return FileResponse(
        path=video_path,
        filename=filename,
        media_type=media_type
    )


@router.get("/{job_id}/audio-file")
async def get_audio_file(job_id: str):
    """
    Stream the extracted audio file for waveform visualization.
    """
    if job_id not in job_store:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = job_store[job_id]
    audio_path = job.get("audio_path")
    
    if not audio_path or not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    return FileResponse(
        path=audio_path,
        filename="audio.wav",
        media_type="audio/wav"
    )
