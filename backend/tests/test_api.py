"""
Integration tests for API endpoints
Tests upload, transcription, analysis, and export flows
"""

import sys
import os
import pytest
from unittest.mock import patch, MagicMock

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from main import create_app
from api.upload import job_store
from services.ai_analyzer import EDLSegment as ServiceEDLSegment


@pytest.fixture
def client():
    """Create test client"""
    app = create_app()
    return TestClient(app)


class TestHealth:
    """Tests for health check endpoint"""

    def test_health_check(self, client):
        """Test health check endpoint"""
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"


class TestUpload:
    """Tests for upload endpoint"""

    def test_upload_invalid_extension(self, client):
        """Test upload with invalid file extension"""
        files = {"file": ("test.txt", b"content", "text/plain")}
        response = client.post("/api/upload/", files=files)
        assert response.status_code == 400
        assert "not allowed" in response.json()["detail"]

    def test_upload_valid_file(self, client):
        """Test upload with valid video file"""
        # Mock audio extraction
        with patch('api.upload.extract_audio', return_value=True):
            files = {"file": ("test.mp4", b"fake video content", "video/mp4")}
            response = client.post("/api/upload/", files=files)
            
            assert response.status_code == 200
            data = response.json()
            assert "job_id" in data
            assert data["filename"] == "test.mp4"
            assert data["audio_extracted"] is False


class TestTranscription:
    """Tests for transcription endpoint"""

    def test_transcribe_job_not_found(self, client):
        """Test transcription with non-existent job"""
        response = client.post("/api/process/transcribe", json={"job_id": "nonexistent"})
        assert response.status_code == 404

    def test_transcribe_success(self, client):
        """Test successful transcription"""
        # Create a job first
        with patch('api.upload.extract_audio', return_value=True):
            files = {"file": ("test.mp4", b"fake video content", "video/mp4")}
            upload_resp = client.post("/api/upload/", files=files)
            job_id = upload_resp.json()["job_id"]

        # Create fake audio file
        audio_path = os.path.join(os.path.dirname(__file__), "fake_audio.wav")
        with open(audio_path, "wb") as f:
            f.write(b"fake audio data")
        job_store[job_id]["audio_path"] = audio_path

        # Mock transcription
        mock_result = {
            "segments": [
                {"id": 1, "start": 0.0, "end": 2.5, "text": "Hello world", "word_count": 2},
            ],
            "duration": 2.5,
            "language": "en"
        }

        with patch('services.transcriber.transcribe_audio', return_value=mock_result):
            response = client.post("/api/process/transcribe", json={"job_id": job_id})
            assert response.status_code == 200
            data = response.json()
            assert data["job_id"] == job_id
            assert len(data["segments"]) == 1
            assert data["segments"][0]["text"] == "Hello world"


class TestAnalysis:
    """Tests for analysis endpoint"""

    def test_analyze_no_transcription(self, client):
        """Test analysis without prior transcription"""
        # Create a job
        with patch('api.upload.extract_audio', return_value=True):
            files = {"file": ("test.mp4", b"fake video content", "video/mp4")}
            upload_resp = client.post("/api/upload/", files=files)
            job_id = upload_resp.json()["job_id"]

        response = client.post("/api/process/analyze", json={"job_id": job_id})
        assert response.status_code == 400
        assert "transcribe first" in response.json()["detail"]

    def test_analyze_success(self, client):
        """Test successful analysis with EDL generation"""
        # Create a job and transcribe
        with patch('api.upload.extract_audio', return_value=True):
            files = {"file": ("test.mp4", b"fake video content", "video/mp4")}
            upload_resp = client.post("/api/upload/", files=files)
            job_id = upload_resp.json()["job_id"]

        # Create fake audio file
        audio_path = os.path.join(os.path.dirname(__file__), "fake_audio.wav")
        with open(audio_path, "wb") as f:
            f.write(b"fake audio data")
        job_store[job_id]["audio_path"] = audio_path

        mock_result = {
            "segments": [
                {"id": 1, "start": 0.0, "end": 2.5, "text": "Hello world", "word_count": 2},
                {"id": 2, "start": 2.5, "end": 4.0, "text": "Let me share screen", "word_count": 4},
            ],
            "duration": 4.0,
            "language": "en"
        }

        with patch('services.transcriber.transcribe_audio', return_value=mock_result):
            client.post("/api/process/transcribe", json={"job_id": job_id})

        # Mock analysis - return EDLSegment objects
        mock_edl = [
            ServiceEDLSegment(id=1, start=0.0, end=2.5, text="Hello world", keep=True),
            ServiceEDLSegment(id=2, start=2.5, end=4.0, text="Let me share screen", keep=False),
        ]
        mock_stats = {
            "total_segments": 2,
            "kept_segments": 1,
            "removed_segments": 1,
            "total_duration": 4.0,
            "kept_duration": 2.5,
            "removed_duration": 1.5,
            "kept_percentage": 62.5
        }

        with patch('services.ai_analyzer.analyze_and_generate_edl', return_value=(mock_edl, mock_stats)):
            response = client.post("/api/process/analyze", json={"job_id": job_id})
            assert response.status_code == 200
            data = response.json()
            assert data["job_id"] == job_id
            assert len(data["edl"]) == 2
            assert data["edl"][0]["keep"] is True
            assert data["edl"][1]["keep"] is False
            assert data["stats"]["kept_segments"] == 1


class TestExport:
    """Tests for export endpoint"""

    def test_export_job_not_found(self, client):
        """Test export with non-existent job"""
        response = client.post("/api/export/", json={
            "job_id": "nonexistent",
            "segments": [],
            "settings": {"resolution": "original", "codec": "libx264", "crf": 23, "framerate": "original"}
        })
        assert response.status_code == 404

    def test_export_no_segments(self, client):
        """Test export with no kept segments"""
        # Create a job
        with patch('api.upload.extract_audio', return_value=True):
            files = {"file": ("test.mp4", b"fake video content", "video/mp4")}
            upload_resp = client.post("/api/upload/", files=files)
            job_id = upload_resp.json()["job_id"]

        response = client.post("/api/export/", json={
            "job_id": job_id,
            "segments": [
                {"id": 1, "start": 0.0, "end": 2.5, "text": "Remove", "keep": False}
            ],
            "settings": {"resolution": "original", "codec": "libx264", "crf": 23, "framerate": "original"}
        })
        assert response.status_code == 400
        assert "No segments selected" in response.json()["detail"]

    def test_export_success(self, client):
        """Test successful export start"""
        # Create a job
        with patch('api.upload.extract_audio', return_value=True):
            files = {"file": ("test.mp4", b"fake video content", "video/mp4")}
            upload_resp = client.post("/api/upload/", files=files)
            job_id = upload_resp.json()["job_id"]

        # Mock render_video
        with patch('api.export.render_video', return_value=("export_123", "/tmp/output.mp4")):
            response = client.post("/api/export/", json={
                "job_id": job_id,
                "segments": [
                    {"id": 1, "start": 0.0, "end": 2.5, "text": "Keep", "keep": True}
                ],
                "settings": {"resolution": "original", "codec": "libx264", "crf": 23, "framerate": "original"}
            })
            assert response.status_code == 200
            data = response.json()
            assert "export_id" in data
            assert data["status"] == "processing"