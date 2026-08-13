# AI Screencast Editor

An AI-powered video editing tool that automatically removes "fluff" from educational screencasts and tutorials. Upload a video, let AI analyze and transcribe it, then edit by simply modifying the text transcript.

## Features

- 🎥 **Video Upload & Transcription** - Upload videos and get accurate transcriptions with word-level timestamps
- 🤖 **AI-Powered Fluff Detection** - Automatically identifies and marks organizational chatter, hesitations, and off-topic content
- 📝 **Text-Based Editing** - Edit your video by clicking, cutting, and keeping text segments
- 🎬 **Timeline Editor** - Visual timeline with draggable segment boundaries for precise edits
- ⚡ **Smart Preview** - Skip removed sections automatically during playback
- 🎯 **Custom Export** - Export with your choice of resolution, codec, quality, and framerate

## Tech Stack

### Backend
- **FastAPI** - High-performance async Python web framework
- **OpenAI Whisper** - Local speech-to-text transcription
- **NVIDIA NIM API** - Llama 3.1 70B for semantic analysis
- **FFmpeg** - Professional video processing

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Fast build tooling
- **Tailwind CSS** - Utility-first styling
- **Zustand** - Lightweight state management
- **wavesurfer.js** - Audio waveform visualization

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 20+
- FFmpeg installed and in PATH
- NVIDIA API key (get from [NVIDIA NIM](https://build.nvidia.com/))

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and add your NVIDIA_API_KEY
uvicorn main:app --reload
```

Backend will be available at `http://localhost:8000`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend will be available at `http://localhost:5173`

## Project Structure

```
AIScreencastEditor/
├── backend/
│   ├── api/              # API route handlers
│   │   ├── upload.py     # Video upload endpoint
│   │   ├── process.py    # Transcription & analysis
│   │   └── export.py     # Video export
│   ├── services/         # Business logic
│   │   ├── transcriber.py    # Whisper integration
│   │   ├── ai_analyzer.py    # LLM analysis
│   │   └── video_renderer.py # FFmpeg commands
│   ├── data/             # Uploads & exports storage
│   ├── main.py           # FastAPI app entry
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/   # React components
│   │   │   ├── Header.tsx
│   │   │   ├── MainEditor.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── VideoPlayer.tsx
│   │   │   ├── Transcript.tsx
│   │   │   ├── Timeline.tsx
│   │   │   └── ExportModal.tsx
│   │   ├── store/        # Zustand store
│   │   │   └── useEditorStore.ts
│   │   ├── types/        # TypeScript types
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
│
├── DEVELOPMENT_PLAN.md   # Detailed development roadmap
├── Prompt.md             # Original PRD
└── README.md
```

## Development Phases

This project is being developed in phases:

- [x] **Phase 1**: Foundation & Infrastructure (Backend + Frontend scaffolding)
- [x] **Phase 2**: Media Ingestion & Transcription
- [x] **Phase 3**: AI Semantic Filtering
- [x] **Phase 4**: Frontend Core (State & Video Player)
- [x] **Phase 5**: Transcript Editor UI
- [x] **Phase 6**: Timeline Editor
- [x] **Phase 7**: Export Pipeline
- [x] **Phase 8**: Polish & Edge Cases (95% complete)

**Overall Project Completion: ~99%**

## API Endpoints

### Upload
- `POST /api/upload/` - Upload a video file
- `GET /api/upload/{job_id}/status` - Get upload status
- `GET /api/upload/{job_id}/audio` - Get extracted audio path
- `GET /api/upload/{job_id}/video` - Stream video for playback
- `GET /api/upload/{job_id}/audio-file` - Stream audio for waveform

### Process
- `POST /api/process/transcribe` - Transcribe audio with Whisper
- `POST /api/process/analyze` - Analyze transcript with LLM
- `GET /api/process/jobs/{job_id}` - Get job details

### Export
- `POST /api/export/` - Start video export
- `GET /api/export/{export_id}/progress` - Get export progress (SSE)
- `GET /api/export/download/{export_id}` - Download exported video
- `GET /api/export/status/{export_id}` - Get export status
- `DELETE /api/export/{export_id}` - Cancel export

### Health
- `GET /api/health` - Health check

## Testing

```bash
cd backend
python -m pytest tests/ -v
```

The test suite includes:
- Unit tests for AI Analyzer (EDL generation, smoothing, stats)
- Unit tests for Video Renderer (FFmpeg commands, concat files)
- Integration tests for API endpoints (upload, transcribe, analyze, export)

**29 tests, all passing.**

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- [OpenAI Whisper](https://github.com/openai/whisper) for transcription
- [NVIDIA NIM](https://build.nvidia.com/) for LLM inference
- [FFmpeg](https://ffmpeg.org/) for video processing
- [wavesurfer.js](https://wavesurfer.xyz/) for audio visualization