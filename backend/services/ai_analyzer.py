"""
AI Semantic Filtering Service
Uses NVIDIA NIM API with Llama 3.1 70B to identify and filter fluff content
"""

import json
import re
import asyncio
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, asdict
from openai import OpenAI

from config import settings


@dataclass
class EDLSegment:
    id: int
    start: float
    end: float
    text: str
    keep: bool
    reason: Optional[str] = None


class AIAnalyzerService:
    """Service for analyzing transcripts and identifying fluff content"""
    
    def __init__(self):
        self.client: OpenAI | None = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize OpenAI client configured for NVIDIA NIM API"""
        self.client = OpenAI(
            base_url=settings.NVIDIA_BASE_URL,
            api_key=settings.NVIDIA_API_KEY
        )
    
    def _prepare_segments_for_llm(self, segments: List[Dict]) -> str:
        """
        Prepare segments for LLM by creating a minimal payload.
        Strips timestamps to save tokens and ensure reliable JSON output.
        """
        prepared = []
        for segment in segments:
            prepared.append({
                "id": segment["id"],
                "text": segment["text"].strip()
            })
        return json.dumps(prepared, ensure_ascii=False)
    
    def _get_system_prompt(self) -> str:
        """Get the system prompt for the LLM"""
        return """You are a professional video editor specializing in educational content. Your task is to analyze video transcripts and identify segments that should be REMOVED as "fluff" versus segments that should be KEPT as valuable educational content.

FLUFF to REMOVE includes:
- Organizational chatter: "Let me share my screen", "Can you see my screen?", "Is this recording?"
- Hesitations and filler words: "Um", "Uh", "Like", "You know" (when excessive)
- Technical difficulties: "Wait a second", "Let me fix this", "Where is the..."
- Off-topic conversations: Personal stories, unrelated anecdotes
- Long pauses or silence (indicated by very short segments with few words)
- Repetitive content or redundant explanations
- Loading screens or waiting periods
- "I'll just...", "Let me...", "Now I'm going to..."

EDUCATIONAL CONTENT to KEEP includes:
- Actual teaching content and explanations
- Demonstrations and walkthroughs
- Key concepts and definitions
- Examples and use cases
- Important transitions between topics
- Questions and answers related to the topic
- Code explanations or software demonstrations

OUTPUT FORMAT:
You MUST return a valid JSON object with the following structure:
{
  "keep_ids": [1, 3, 5, 7, ...],
  "remove_ids": [2, 4, 6, ...],
  "reasons": {
    "2": "Organizational chatter - screen sharing",
    "4": "Technical difficulty - looking for file",
    ...
  }
}

IMPORTANT:
- Return ONLY the JSON object, no additional text
- Be conservative: when in doubt, KEEP the segment
- Consider the overall flow and coherence
- Remove segments that would make the video jumpy if kept"""
    
    def _get_user_prompt(self, segments_json: str) -> str:
        """Get the user prompt for the LLM"""
        return f"""Analyze the following video transcript segments and identify which ones are fluff that should be removed. Return your analysis as a JSON object.

TRANSCRIPT SEGMENTS:
{segments_json}

ANALYSIS:"""
    
    async def analyze_segments_async(self, segments: List[Dict]) -> Tuple[List[int], List[int], Dict[str, str]]:
        """
        Analyze segments asynchronously to identify fluff.
        Returns tuple of (keep_ids, remove_ids, reasons).
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._analyze_segments_sync,
            segments
        )
    
    def _analyze_segments_sync(self, segments: List[Dict]) -> Tuple[List[int], List[int], Dict[str, str]]:
        """
        Synchronous analysis using LLM.
        Must be run in thread pool to avoid blocking.
        """
        # Prepare segments for LLM
        segments_json = self._prepare_segments_for_llm(segments)
        
        # Get system and user prompts
        system_prompt = self._get_system_prompt()
        user_prompt = self._get_user_prompt(segments_json)
        
        try:
            if self.client is None:
                self._initialize_client()
            assert self.client is not None
            # Call LLM via NVIDIA NIM API
            response = self.client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,  # Low temperature for consistent output
                max_tokens=4000,
                response_format={"type": "json_object"}  # Ensure JSON output
            )
            
            # Parse response
            result_text = response.choices[0].message.content.strip()
            
            # Extract JSON from response (handle potential markdown formatting)
            json_match = re.search(r'\{.*\}', result_text, re.DOTALL)
            if json_match:
                result_json = json.loads(json_match.group())
            else:
                result_json = json.loads(result_text)
            
            keep_ids = result_json.get("keep_ids", [])
            remove_ids = result_json.get("remove_ids", [])
            reasons = result_json.get("reasons", {})
            
            return keep_ids, remove_ids, reasons
            
        except Exception as e:
            print(f"LLM analysis failed: {e}")
            # Fallback: keep all segments
            return [s["id"] for s in segments], [], {}
    
    def generate_edl(
        self, 
        segments: List[Dict], 
        keep_ids: List[int], 
        remove_ids: List[int],
        reasons: Dict[str, str]
    ) -> List[EDLSegment]:
        """
        Generate Edit Decision List (EDL) from segments and LLM decisions.
        """
        edl = []
        for segment in segments:
            segment_id = segment["id"]
            keep = segment_id in keep_ids
            
            edl_segment = EDLSegment(
                id=segment_id,
                start=segment["start"],
                end=segment["end"],
                text=segment["text"],
                keep=keep,
                reason=reasons.get(str(segment_id))
            )
            edl.append(edl_segment)
        
        return edl
    
    def smooth_edl(self, edl: List[EDLSegment], gap_threshold: float = 2.0) -> List[EDLSegment]:
        """
        Smooth the EDL by bridging small gaps between kept segments.
        If the gap between two 'keep=true' segments is less than threshold,
        mark the gap segment as 'keep=true' to prevent jumpy audio.
        """
        if not edl:
            return edl
        
        smoothed = edl.copy()
        
        # Find all kept segments
        kept_indices = [i for i, seg in enumerate(smoothed) if seg.keep]
        
        if len(kept_indices) < 2:
            return smoothed
        
        # Check gaps between consecutive kept segments
        for i in range(len(kept_indices) - 1):
            current_idx = kept_indices[i]
            next_idx = kept_indices[i + 1]
            
            # Calculate gap
            gap_start = smoothed[current_idx].end
            gap_end = smoothed[next_idx].start
            gap_duration = gap_end - gap_start
            
            # If gap is smaller than threshold, bridge it
            if 0 < gap_duration < gap_threshold:
                # Mark all segments in the gap as keep
                for j in range(current_idx + 1, next_idx):
                    if not smoothed[j].keep:
                        smoothed[j] = EDLSegment(
                            id=smoothed[j].id,
                            start=smoothed[j].start,
                            end=smoothed[j].end,
                            text=smoothed[j].text,
                            keep=True,
                            reason="Bridged gap (< 2s) for smoother playback"
                        )
        
        return smoothed
    
    def calculate_stats(self, edl: List[EDLSegment]) -> Dict:
        """Calculate statistics about the EDL"""
        total_duration = sum(seg.end - seg.start for seg in edl)
        kept_duration = sum(seg.end - seg.start for seg in edl if seg.keep)
        removed_duration = total_duration - kept_duration
        
        return {
            "total_segments": len(edl),
            "kept_segments": sum(1 for seg in edl if seg.keep),
            "removed_segments": sum(1 for seg in edl if not seg.keep),
            "total_duration": round(total_duration, 3),
            "kept_duration": round(kept_duration, 3),
            "removed_duration": round(removed_duration, 3),
            "kept_percentage": round((kept_duration / total_duration) * 100, 1) if total_duration > 0 else 0
        }


# Global service instance
ai_analyzer_service = AIAnalyzerService()


async def analyze_and_generate_edl(segments: List[Dict]) -> Tuple[List[EDLSegment], Dict]:
    """
    Convenience function to analyze segments and generate smoothed EDL.
    """
    # Analyze segments with LLM
    keep_ids, remove_ids, reasons = await ai_analyzer_service.analyze_segments_async(segments)
    
    # Generate EDL
    edl = ai_analyzer_service.generate_edl(segments, keep_ids, remove_ids, reasons)
    
    # Smooth EDL
    edl = ai_analyzer_service.smooth_edl(edl)
    
    # Calculate stats
    stats = ai_analyzer_service.calculate_stats(edl)
    
    return edl, stats