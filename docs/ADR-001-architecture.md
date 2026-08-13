# ADR-001: System Architecture

## Status
Accepted

## Context
We need to build a local web application for automated video editing of educational screencasts. The application must:
- Transcribe video audio with precise timestamps
- Use AI to identify and remove "fluff" content
- Provide a web-based GUI for manual review and adjustment
- Export the final video with custom encoding settings

## Decision
We will use the following architecture:

### Backend: FastAPI (Python 3.10+)
- **Async-first**: All I/O operations (FFmpeg, Whisper, LLM calls) run asynchronously
- **REST API**: Clean separation of concerns with dedicated routers for upload, process, and export
- **Pydantic models**: Strong validation for all API requests/responses

### AI Processing
- **Whisper (local)**: For transcription with word-level timestamps
- **NVIDIA NIM API (Llama 3.1 70B)**: For semantic analysis and fluff detection
- **Fallback strategy**: If LLM is unavailable, keep all segments

### Media Processing
- **FFmpeg**: For audio extraction, video rendering, and encoding
- **Concat demuxer**: For precise segment cutting with inpoint/outpoint

### Frontend: React 18 + Vite + TypeScript
- **Zustand**: Single source of truth for state management
- **wavesurfer.js**: For timeline visualization and region editing
- **Tailwind CSS**: For styling

## Consequences
### Positive
- Clean separation between frontend and backend
- Async architecture prevents blocking
- Local processing keeps data private
- Flexible export options

### Negative
- Requires FFmpeg and Whisper installed locally
- LLM API dependency for analysis
- Browser memory constraints for large videos

## Alternatives Considered
1. **MoviePy**: Rejected due to slow performance and lack of codec controls
2. **Cloud-based processing**: Rejected due to privacy concerns
3. **WebSockets for progress**: Replaced with SSE for simplicity