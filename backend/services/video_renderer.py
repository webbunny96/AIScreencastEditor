"""
Video Renderer Service
Handles FFmpeg video export with custom encoding settings
"""

import os
import asyncio
import tempfile
import uuid
import shutil
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass

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


def find_ffprobe() -> str:
    """Find ffprobe executable, checking PATH and common install locations"""
    # Check PATH first
    ffprobe_path = shutil.which("ffprobe")
    if ffprobe_path:
        return ffprobe_path
    
    # Check common Windows install locations
    common_paths = [
        # WinGet install location
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0-full_build\bin\ffprobe.exe"),
        # Chocolatey
        r"C:\ProgramData\chocolatey\bin\ffprobe.exe",
        # Manual installs
        r"C:\ffmpeg\bin\ffprobe.exe",
        r"C:\Program Files\ffmpeg\bin\ffprobe.exe",
    ]
    
    for path in common_paths:
        if os.path.exists(path):
            return path
    
    raise RuntimeError("FFprobe not found. Please install FFmpeg and add it to PATH.")


@dataclass
class ExportConfig:
    """Export configuration settings"""
    resolution: str  # original, 1080p, 720p
    codec: str  # libx264, libx265
    crf: int  # 18, 23, 28
    framerate: str  # original, 30, 60


@dataclass
class ExportSegment:
    """Segment for export"""
    id: int
    start: float
    end: float
    text: str
    keep: bool


class VideoRendererService:
    """Service for rendering videos using FFmpeg"""
    
    def __init__(self):
        self.export_dir = settings.EXPORT_DIR
        os.makedirs(self.export_dir, exist_ok=True)
    
    def _get_scale_filter(self, resolution: str, original_width: int, original_height: int) -> Optional[str]:
        """Get FFmpeg scale filter for resolution"""
        if resolution == 'original':
            return None
        
        resolution_map = {
            '1080p': (1920, 1080),
            '720p': (1280, 720),
        }
        
        target = resolution_map.get(resolution)
        if not target:
            return None
        
        target_width, target_height = target
        
        # Use scale filter with aspect ratio preservation
        return f'scale={target_width}:{target_height}:force_original_aspect_ratio=decrease,pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2'
    
    def _get_framerate_filter(self, framerate: str) -> Optional[str]:
        """Get FFmpeg framerate filter"""
        if framerate == 'original':
            return None
        return f'fps={framerate}'
    
    def generate_concat_file(self, segments: List[ExportSegment], input_path: str) -> str:
        """
        Generate FFmpeg concat demuxer file.
        Returns path to temporary concat file.
        """
        # Filter only kept segments
        kept_segments = [s for s in segments if s.keep]
        
        if not kept_segments:
            raise ValueError("No segments to export")
        
        # Convert input path to absolute path
        abs_input_path = os.path.abspath(input_path)
        
        # Create temporary concat file
        fd, concat_path = tempfile.mkstemp(suffix='.txt', prefix='concat_')
        
        with os.fdopen(fd, 'w') as f:
            f.write("ffconcat version 1.0\n")
            
            for segment in kept_segments:
                f.write(f"file '{abs_input_path}'\n")
                f.write(f"inpoint {segment.start:.3f}\n")
                f.write(f"outpoint {segment.end:.3f}\n")
        
        return concat_path
    
    def build_ffmpeg_command(
        self,
        concat_file: str,
        output_path: str,
        config: ExportConfig,
        original_width: int = 1920,
        original_height: int = 1080
    ) -> List[str]:
        """
        Build FFmpeg command for export.
        Uses concat demuxer with re-encoding.
        """
        # Base command
        cmd = [
            find_ffmpeg(),
            "-y",  # Overwrite output
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file,
        ]
        
        # Build filter complex if needed
        filters = []
        
        # Video scale filter
        scale_filter = self._get_scale_filter(config.resolution, original_width, original_height)
        if scale_filter:
            filters.append(scale_filter)
        
        # Framerate filter
        fps_filter = self._get_framerate_filter(config.framerate)
        if fps_filter:
            filters.append(fps_filter)
        
        # Add filters if any
        if filters:
            filter_str = ",".join(filters)
            cmd.extend(["-vf", filter_str])
        
        # Video codec settings
        cmd.extend([
            "-c:v", config.codec,
            "-crf", str(config.crf),
            "-preset", "medium",
        ])
        
        # Audio settings
        cmd.extend([
            "-c:a", "aac",
            "-b:a", "128k",
        ])
        
        # Output
        cmd.append(output_path)
        
        return cmd
    
    async def export_video_async(
        self,
        segments: List[ExportSegment],
        input_path: str,
        config: ExportConfig,
        original_width: int = 1920,
        original_height: int = 1080
    ) -> Tuple[str, str]:
        """
        Asynchronously export video.
        Returns (export_id, output_path).
        """
        # Generate unique export ID
        export_id = str(uuid.uuid4())
        output_filename = f"export_{export_id}.mp4"
        output_path = os.path.abspath(os.path.join(self.export_dir, output_filename))
        
        # Ensure export directory exists as absolute path
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Generate concat file
        concat_file = self.generate_concat_file(segments, input_path)
        
        # Build FFmpeg command
        cmd = self.build_ffmpeg_command(
            concat_file, output_path, config, original_width, original_height
        )
        
        # Run FFmpeg asynchronously
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            # Wait for completion and capture stderr for progress
            _, stderr = await process.communicate()
            
            # Clean up concat file
            try:
                os.remove(concat_file)
            except OSError:
                pass
            
            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                raise RuntimeError(f"FFmpeg error: {error_msg}")
            
            return export_id, output_path
            
        except Exception as e:
            # Clean up on error
            try:
                os.remove(concat_file)
            except OSError:
                pass
            raise
    
    def get_video_info(self, video_path: str) -> Dict:
        """Get video information using ffprobe"""
        import subprocess
        
        try:
            cmd = [
                find_ffprobe(),
                "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height,r_frame_rate,duration",
                "-of", "csv=p=0",
                video_path
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                return {"width": 1920, "height": 1080, "fps": 30, "duration": 0}
            
            parts = result.stdout.strip().split(",")
            if len(parts) >= 4:
                return {
                    "width": int(parts[0]),
                    "height": int(parts[1]),
                    "fps": eval(parts[2]),  # Evaluate fraction like "30/1"
                    "duration": float(parts[3])
                }
            
            return {"width": 1920, "height": 1080, "fps": 30, "duration": 0}
            
        except Exception:
            return {"width": 1920, "height": 1080, "fps": 30, "duration": 0}


# Global service instance
video_renderer_service = VideoRendererService()


async def render_video(
    segments: List[Dict],
    input_path: str,
    config: ExportConfig
) -> Tuple[str, str]:
    """
    Convenience function to render video from segments.
    """
    # Convert segments to ExportSegment
    export_segments = [
        ExportSegment(
            id=s["id"],
            start=s["start"],
            end=s["end"],
            text=s["text"],
            keep=s["keep"]
        )
        for s in segments
    ]
    
    # Get video info
    video_info = video_renderer_service.get_video_info(input_path)
    
    # Export video
    return await video_renderer_service.export_video_async(
        export_segments,
        input_path,
        config,
        video_info["width"],
        video_info["height"]
    )