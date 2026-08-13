"""
AI Processing API Endpoints
Handles transcription and semantic analysis
"""

import asyncio
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from config import settings
from api.upload import job_store
from services import transcriber as transcriber_service
from services import ai_analyzer as ai_analyzer_service
from services.ai_analyzer import EDLSegment


router = APIRouter()


class TranscriptSegment(BaseModel):
    id: int
    start: float
    end: float
    text: str
    word_count: int
    words: Optional[List[dict]] = None


class TranscriptionRequest(BaseModel):
    job_id: str


class TranscriptionResponse(BaseModel):
    job_id: str
    segments: List[TranscriptSegment]
    duration: float
    language: str


class AnalysisRequest(BaseModel):
    job_id: str


class EDLSegmentResponse(BaseModel):
    id: int
    start: float
    end: float
    text: str
    keep: bool
    reason: Optional[str] = None


class AnalysisResponse(BaseModel):
    job_id: str
    edl: List[EDLSegmentResponse]
    stats: dict


# Store transcription results
transcription_store = {}


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_endpoint(request: TranscriptionRequest):
    """
    Transcribe audio using Whisper.
    Returns segments with precise timestamps.
    """
    # Validate job exists
    if request.job_id not in job_store:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = job_store[request.job_id]
    audio_path = job.get("audio_path")
    
    if not audio_path or not os.path.exists(audio_path):
        raise HTTPException(status_code=400, detail="Audio file not ready. Please wait for upload to complete.")
    
    # Check if already transcribed
    if request.job_id in transcription_store:
        result = transcription_store[request.job_id]
        return TranscriptionResponse(
            job_id=request.job_id,
            segments=result["segments"],
            duration=result["duration"],
            language=result["language"]
        )
    
    try:
        # Run transcription asynchronously
        result = await transcriber_service.transcribe_audio(audio_path)
        
        # Store result
        transcription_store[request.job_id] = result
        
        # Update job status
        job["status"] = "transcribed"
        job["transcription"] = result
        
        return TranscriptionResponse(
            job_id=request.job_id,
            segments=result["segments"],
            duration=result["duration"],
            language=result["language"]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_transcript(request: AnalysisRequest):
    """
    Analyze transcript with LLM to identify and filter fluff.
    Uses NVIDIA NIM API with Llama 3.1 70B.
    """
    # Validate job exists
    if request.job_id not in job_store:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Check if transcription exists
    if request.job_id not in transcription_store:
        raise HTTPException(status_code=400, detail="No transcription found. Please transcribe first.")
    
    # Get transcription
    transcription = transcription_store[request.job_id]
    segments = transcription["segments"]
    
    if not segments:
        raise HTTPException(status_code=400, detail="No segments to analyze.")
    
    try:
        # Analyze and generate EDL
        edl, stats = await ai_analyzer_service.analyze_and_generate_edl(segments)
        
        # Convert EDLSegment dataclass to dict for response
        edl_response = [
            EDLSegmentResponse(
                id=seg.id,
                start=seg.start,
                end=seg.end,
                text=seg.text,
                keep=seg.keep,
                reason=seg.reason
            )
            for seg in edl
        ]
        
        # Store EDL in job
        job_store[request.job_id]["edl"] = [
            {"id": seg.id, "start": seg.start, "end": seg.end, "text": seg.text, "keep": seg.keep}
            for seg in edl
        ]
        job_store[request.job_id]["status"] = "analyzed"
        
        return AnalysisResponse(
            job_id=request.job_id,
            edl=edl_response,
            stats=stats
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/jobs/{job_id}")
async def get_job_details(job_id: str):
    """Get full job details including transcription if available"""
    if job_id not in job_store:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = job_store[job_id]
    return {
        "job_id": job_id,
        "status": job["status"],
        "filename": job.get("filename"),
        "has_audio": os.path.exists(job.get("audio_path", "")),
        "has_transcription": job_id in transcription_store,
        "transcription": transcription_store.get(job_id)
    }