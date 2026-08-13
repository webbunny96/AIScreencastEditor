"""
Unit tests for AI Analyzer Service
Tests EDL generation, smoothing algorithm, and stats calculation
"""

import sys
import os
import pytest
from unittest.mock import patch, MagicMock

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.ai_analyzer import AIAnalyzerService, EDLSegment


@pytest.fixture
def analyzer():
    """Create AIAnalyzerService instance with mocked client"""
    with patch('services.ai_analyzer.AIAnalyzerService._initialize_client'):
        service = AIAnalyzerService()
        service.client = MagicMock()
        return service


@pytest.fixture
def sample_segments():
    """Sample transcript segments for testing"""
    return [
        {"id": 1, "start": 0.0, "end": 2.5, "text": "Hello everyone, welcome to the tutorial."},
        {"id": 2, "start": 2.5, "end": 4.0, "text": "Let me share my screen first."},
        {"id": 3, "start": 4.0, "end": 6.5, "text": "Today we'll learn about Python."},
        {"id": 4, "start": 6.5, "end": 8.0, "text": "Wait a second, let me fix this."},
        {"id": 5, "start": 8.0, "end": 10.5, "text": "Python is a great programming language."},
    ]


class TestEDLGeneration:
    """Tests for EDL generation"""

    def test_generate_edl_basic(self, analyzer, sample_segments):
        """Test basic EDL generation with keep/remove decisions"""
        keep_ids = [1, 3, 5]
        remove_ids = [2, 4]
        reasons = {"2": "Screen sharing", "4": "Technical difficulty"}

        edl = analyzer.generate_edl(sample_segments, keep_ids, remove_ids, reasons)

        assert len(edl) == 5
        assert edl[0].keep is True
        assert edl[1].keep is False
        assert edl[1].reason == "Screen sharing"
        assert edl[2].keep is True
        assert edl[3].keep is False
        assert edl[3].reason == "Technical difficulty"
        assert edl[4].keep is True

    def test_generate_edl_all_keep(self, analyzer, sample_segments):
        """Test EDL generation when all segments are kept"""
        keep_ids = [1, 2, 3, 4, 5]
        edl = analyzer.generate_edl(sample_segments, keep_ids, [], {})

        assert all(seg.keep for seg in edl)

    def test_generate_edl_all_remove(self, analyzer, sample_segments):
        """Test EDL generation when all segments are removed"""
        edl = analyzer.generate_edl(sample_segments, [], [1, 2, 3, 4, 5], {})

        assert all(not seg.keep for seg in edl)


class TestSmoothing:
    """Tests for EDL smoothing algorithm"""

    def test_smooth_bridges_small_gap(self, analyzer):
        """Test that small gaps (< 2s) between kept segments are bridged"""
        edl = [
            EDLSegment(id=1, start=0.0, end=2.0, text="Keep 1", keep=True),
            EDLSegment(id=2, start=2.0, end=3.0, text="Remove me", keep=False),
            EDLSegment(id=3, start=3.0, end=5.0, text="Keep 2", keep=True),
        ]

        smoothed = analyzer.smooth_edl(edl, gap_threshold=2.0)

        # Gap segment should be bridged (kept)
        assert smoothed[1].keep is True
        assert smoothed[1].reason == "Bridged gap (< 2s) for smoother playback"

    def test_smooth_does_not_bridge_large_gap(self, analyzer):
        """Test that large gaps (> 2s) are not bridged"""
        edl = [
            EDLSegment(id=1, start=0.0, end=2.0, text="Keep 1", keep=True),
            EDLSegment(id=2, start=2.0, end=5.0, text="Remove me", keep=False),
            EDLSegment(id=3, start=5.0, end=7.0, text="Keep 2", keep=True),
        ]

        smoothed = analyzer.smooth_edl(edl, gap_threshold=2.0)

        # Gap segment should remain removed
        assert smoothed[1].keep is False

    def test_smooth_single_kept_segment(self, analyzer):
        """Test smoothing with only one kept segment"""
        edl = [
            EDLSegment(id=1, start=0.0, end=2.0, text="Keep 1", keep=True),
            EDLSegment(id=2, start=2.0, end=3.0, text="Remove me", keep=False),
        ]

        smoothed = analyzer.smooth_edl(edl, gap_threshold=2.0)

        assert len(smoothed) == 2
        assert smoothed[0].keep is True
        assert smoothed[1].keep is False

    def test_smooth_empty_edl(self, analyzer):
        """Test smoothing with empty EDL"""
        smoothed = analyzer.smooth_edl([], gap_threshold=2.0)
        assert smoothed == []


class TestStats:
    """Tests for statistics calculation"""

    def test_calculate_stats_basic(self, analyzer):
        """Test basic stats calculation"""
        edl = [
            EDLSegment(id=1, start=0.0, end=2.0, text="Keep 1", keep=True),
            EDLSegment(id=2, start=2.0, end=4.0, text="Remove me", keep=False),
            EDLSegment(id=3, start=4.0, end=6.0, text="Keep 2", keep=True),
        ]

        stats = analyzer.calculate_stats(edl)

        assert stats["total_segments"] == 3
        assert stats["kept_segments"] == 2
        assert stats["removed_segments"] == 1
        assert stats["total_duration"] == 6.0
        assert stats["kept_duration"] == 4.0
        assert stats["removed_duration"] == 2.0
        assert stats["kept_percentage"] == 66.7

    def test_calculate_stats_empty(self, analyzer):
        """Test stats with empty EDL"""
        stats = analyzer.calculate_stats([])

        assert stats["total_segments"] == 0
        assert stats["kept_segments"] == 0
        assert stats["removed_segments"] == 0
        assert stats["total_duration"] == 0
        assert stats["kept_percentage"] == 0


class TestLLMParsing:
    """Tests for LLM response parsing"""

    def test_analyze_segments_sync_success(self, analyzer, sample_segments):
        """Test successful LLM analysis"""
        # Mock LLM response
        mock_response = MagicMock()
        mock_response.choices[0].message.content = (
            '{"keep_ids": [1, 3, 5], "remove_ids": [2, 4], '
            '"reasons": {"2": "Screen sharing", "4": "Technical difficulty"}}'
        )
        analyzer.client.chat.completions.create.return_value = mock_response

        keep_ids, remove_ids, reasons = analyzer._analyze_segments_sync(sample_segments)

        assert keep_ids == [1, 3, 5]
        assert remove_ids == [2, 4]
        assert reasons == {"2": "Screen sharing", "4": "Technical difficulty"}

    def test_analyze_segments_sync_fallback(self, analyzer, sample_segments):
        """Test fallback when LLM fails (keep all segments)"""
        analyzer.client.chat.completions.create.side_effect = Exception("API error")

        keep_ids, remove_ids, reasons = analyzer._analyze_segments_sync(sample_segments)

        # Fallback: keep all segments
        assert keep_ids == [1, 2, 3, 4, 5]
        assert remove_ids == []
        assert reasons == {}

    def test_prepare_segments_for_llm(self, analyzer, sample_segments):
        """Test that segments are prepared with minimal payload"""
        import json
        prepared = analyzer._prepare_segments_for_llm(sample_segments)
        parsed = json.loads(prepared)

        assert len(parsed) == 5
        # Should only contain id and text (no timestamps)
        assert "id" in parsed[0]
        assert "text" in parsed[0]
        assert "start" not in parsed[0]
        assert "end" not in parsed[0]