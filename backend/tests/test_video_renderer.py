"""
Unit tests for Video Renderer Service
Tests FFmpeg command building and concat file generation
"""

import sys
import os
import pytest
from unittest.mock import patch, MagicMock

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.video_renderer import VideoRendererService, ExportConfig, ExportSegment


@pytest.fixture
def renderer():
    """Create VideoRendererService instance"""
    with patch('services.video_renderer.settings') as mock_settings:
        mock_settings.EXPORT_DIR = "./data/exports"
        service = VideoRendererService()
        return service


@pytest.fixture
def sample_segments():
    """Sample export segments"""
    return [
        ExportSegment(id=1, start=0.0, end=2.5, text="Hello", keep=True),
        ExportSegment(id=2, start=2.5, end=4.0, text="Remove me", keep=False),
        ExportSegment(id=3, start=4.0, end=6.5, text="World", keep=True),
    ]


class TestConcatFile:
    """Tests for concat file generation"""

    def test_generate_concat_file_only_kept(self, renderer, sample_segments):
        """Test that only kept segments are included in concat file"""
        concat_path = renderer.generate_concat_file(sample_segments, "/path/to/video.mp4")

        with open(concat_path, 'r') as f:
            content = f.read()

        # Should have 2 kept segments (1 and 3) with absolute path
        assert content.count("video.mp4") == 2
        assert "inpoint 0.000" in content
        assert "outpoint 2.500" in content
        assert "inpoint 4.000" in content
        assert "outpoint 6.500" in content

        # Clean up
        os.remove(concat_path)

    def test_generate_concat_file_no_kept(self, renderer):
        """Test that error is raised when no segments are kept"""
        segments = [
            ExportSegment(id=1, start=0.0, end=2.5, text="Remove", keep=False),
        ]

        with pytest.raises(ValueError, match="No segments to export"):
            renderer.generate_concat_file(segments, "/path/to/video.mp4")


class TestFFmpegCommand:
    """Tests for FFmpeg command building"""

    def test_build_command_original_settings(self, renderer):
        """Test command with original resolution and framerate"""
        config = ExportConfig(
            resolution="original",
            codec="libx264",
            crf=23,
            framerate="original"
        )

        cmd = renderer.build_ffmpeg_command(
            "/tmp/concat.txt",
            "/tmp/output.mp4",
            config,
            1920,
            1080
        )

        # Check base command - should be path to ffmpeg executable
        assert "ffmpeg" in cmd[0].lower()
        assert "-y" in cmd
        assert "-f" in cmd
        assert "concat" in cmd
        assert "-i" in cmd
        assert "/tmp/concat.txt" in cmd

        # Check codec settings
        assert "-c:v" in cmd
        assert "libx264" in cmd
        assert "-crf" in cmd
        assert "23" in cmd

        # Check audio settings
        assert "-c:a" in cmd
        assert "aac" in cmd

        # No scale/fps filters for original
        assert "-vf" not in cmd

    def test_build_command_1080p(self, renderer):
        """Test command with 1080p resolution"""
        config = ExportConfig(
            resolution="1080p",
            codec="libx264",
            crf=18,
            framerate="30"
        )

        cmd = renderer.build_ffmpeg_command(
            "/tmp/concat.txt",
            "/tmp/output.mp4",
            config,
            1920,
            1080
        )

        # Check scale filter
        assert "-vf" in cmd
        vf_index = cmd.index("-vf")
        filter_str = cmd[vf_index + 1]
        assert "scale=1920:1080" in filter_str

        # Check fps filter
        assert "fps=30" in filter_str

        # Check CRF
        assert "18" in cmd

    def test_build_command_720p(self, renderer):
        """Test command with 720p resolution"""
        config = ExportConfig(
            resolution="720p",
            codec="libx265",
            crf=28,
            framerate="60"
        )

        cmd = renderer.build_ffmpeg_command(
            "/tmp/concat.txt",
            "/tmp/output.mp4",
            config,
            1920,
            1080
        )

        # Check codec
        assert "libx265" in cmd

        # Check scale filter
        vf_index = cmd.index("-vf")
        filter_str = cmd[vf_index + 1]
        assert "scale=1280:720" in filter_str
        assert "fps=60" in filter_str


class TestVideoInfo:
    """Tests for video info detection"""

    def test_get_video_info_success(self, renderer):
        """Test successful video info retrieval"""
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "1920,1080,30/1,120.5\n"

        with patch('subprocess.run', return_value=mock_result):
            info = renderer.get_video_info("/path/to/video.mp4")

        assert info["width"] == 1920
        assert info["height"] == 1080
        assert info["fps"] == 30
        assert info["duration"] == 120.5

    def test_get_video_info_failure(self, renderer):
        """Test fallback when ffprobe fails"""
        with patch('subprocess.run', side_effect=Exception("ffprobe not found")):
            info = renderer.get_video_info("/path/to/video.mp4")

        # Fallback values
        assert info["width"] == 1920
        assert info["height"] == 1080
        assert info["fps"] == 30
        assert info["duration"] == 0