"""
Whisper Transcription Service
Handles audio transcription with word-level timestamps
"""

import asyncio
import whisper
import json
import os
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, asdict

from config import settings


@dataclass
class WordTimestamp:
    word: str
    start: float
    end: float


@dataclass
class TranscriptSegment:
    id: int
    start: float
    end: float
    text: str
    word_count: int
    words: Optional[List[Dict[str, float]]] = None


class TranscriberService:
    """Service for transcribing audio using OpenAI Whisper"""
    
    def __init__(self, model_name: str | None = None):
        self.model_name = model_name or settings.WHISPER_MODEL
        self.model = None
    
    def load_model(self):
        """Load Whisper model (call once at startup)"""
        if self.model is None:
            print(f"Loading Whisper model: {self.model_name}")
            self.model = whisper.load_model(self.model_name)
            print(f"Whisper model loaded: {self.model_name}")
        return self.model
    
    async def transcribe_async(self, audio_path: str) -> List[TranscriptSegment]:
        """
        Transcribe audio file asynchronously.
        Returns list of segments with precise timestamps.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, 
            self._transcribe_sync, 
            audio_path
        )
    
    def _transcribe_sync(self, audio_path: str) -> List[TranscriptSegment]:
        """
        Synchronous transcription using Whisper.
        Must be run in thread pool to avoid blocking.
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
        model = self.load_model()
        
        # Transcribe with word-level timestamps
        result = model.transcribe(
            audio_path,
            word_timestamps=True,
            task="transcribe",
            language=None,  # Auto-detect
            verbose=False
        )
        
        segments = []
        for i, segment in enumerate(result["segments"]):
            # Extract word timestamps if available
            words = []
            if "words" in segment:
                words = [
                    {
                        "word": w["word"],
                        "start": round(w["start"], 3),
                        "end": round(w["end"], 3)
                    }
                    for w in segment["words"]
                ]
            
            # Count words (handle multiple languages)
            text = segment["text"].strip()
            word_count = len(text.split())
            
            transcript_segment = TranscriptSegment(
                id=i + 1,
                start=round(segment["start"], 3),
                end=round(segment["end"], 3),
                text=text,
                word_count=word_count,
                words=words if words else None
            )
            
            segments.append(transcript_segment)
        
        return segments
    
    def get_duration(self, audio_path: str) -> float:
        """Get audio duration in seconds using Whisper"""
        self.load_model()
        audio = whisper.load_audio(audio_path)
        duration = len(audio) / whisper.audio.SAMPLE_RATE
        return round(duration, 3)


# Global service instance
transcriber_service = TranscriberService()


async def transcribe_audio(audio_path: str) -> dict:
    """
    Convenience function to transcribe audio and return formatted response.
    """
    segments = await transcriber_service.transcribe_async(audio_path)
    duration = transcriber_service.get_duration(audio_path)
    
    # Detect language from first segment (Whisper provides this)
    # For now, we'll return "unknown" - can be enhanced
    language = "unknown"
    
    return {
        "segments": [asdict(s) for s in segments],
        "duration": duration,
        "language": language,
        "total_segments": len(segments)
    }