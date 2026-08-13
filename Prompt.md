# SYSTEM PROMPT & TECHNICAL REQUIREMENTS DOCUMENT (PRD) FOR CURSOR / CLAUDE
**Project Name:** AI Screencast Editor (Descript-style Text & Timeline Video Editor)
**Environment:** Local Web Application (FastAPI Backend + React/Vite Frontend)

## 📌 1. Project Overview & Objectives
You are acting as a Senior Full-Stack Engineer and AI Integration Specialist. Your objective is to build a local web application that automates the editing of educational screencasts and video tutorials. 
The application will analyze the uploaded video, transcribe the audio with word-level or segment-level timestamps, use an LLM to identify and remove "fluff" (organizational chatter, long silences, loading screens), and provide a web-based GUI for the user to review, manually adjust (via text and timeline), and export the final video with custom encoding settings.

## 🛠 2. Technology Stack
- **Backend Framework:** Python 3.10+, FastAPI (async, non-blocking architecture).
- **Media Processing:** `ffmpeg-python` (or raw `subprocess` calls to `ffmpeg`). **Do not use `moviepy`** as it is too slow and lacks advanced codec controls.
- **AI Transcription:** `openai-whisper` (running locally, default to 'small' or 'base' models).
- **AI Text Analysis:** OpenAI Python SDK configured to use **NVIDIA NIM API** (`base_url="https://integrate.api.nvidia.com/v1"`, model: `meta/llama-3.1-70b-instruct`).
- **Frontend Framework:** React 18+ (Vite), TypeScript, Tailwind CSS.
- **State Management:** Zustand (for complex syncing between video player, text, and timeline).
- **Media UI:** `wavesurfer.js` (for timeline/audio waveform visualization) and standard HTML5 `<video>` API for playback.

## 🚀 3. Detailed Feature Specifications

### Phase 1: Ingestion & AI Processing (Backend)
1. **Video Upload Endpoint (`/api/upload`):**
   - Accept `.mp4`, `.mkv`, `.mov` files. Save them to a local `./data/uploads` directory.
   - Extract a lightweight `.wav` audio file using FFmpeg for faster Whisper processing.
2. **Transcription Engine (`/api/process/transcribe`):**
   - Run Whisper on the extracted audio.
   - Output must include precise timestamps. Format: `[{"id": 1, "start": 0.0, "end": 2.5, "text": " Hello everyone,", "word_count": 2}, ...]`.
3. **AI Semantic Filtering (`/api/process/analyze`):**
   - Filter out segments that are pure silence or too short (e.g., < 2 words).
   - Send the JSON transcript to NVIDIA's Llama 3.1 70B via a carefully crafted system prompt.
   - **LLM Instructions:** Instruct the model to act as a video editor. It must identify educational content vs. fluff ("Let me share my screen", "Is this recording?", "Wait a second"). 
   - **LLM Output:** The model must return a strictly formatted JSON array of segment IDs to KEEP.
4. **EDL (Edit Decision List) Generation:**
   - Merge the Whisper data and LLM decisions into a unified EDL state:
     `[{"id": 1, "start": 0.0, "end": 2.5, "text": " Hello everyone,", "keep": false}, ...]`
   - Implement a smoothing algorithm: if the gap between two `keep: true` segments is < 2 seconds, bridge the gap to prevent jumpy audio.

### Phase 2: Frontend Editor (GUI & UI/UX)
The frontend must synchronize three main components perfectly. When one updates, the others must react.

1. **Smart Video Player (`<VideoPlayer />`):**
   - Standard playback controls (Play, Pause, Seek).
   - **Skip Logic (Preview Mode):** Using `requestAnimationFrame` or the `timeupdate` event, the player must instantly jump over segments marked as `keep: false`. If the current time hits a skipped segment's start time, it sets `video.currentTime = skipped_segment.end`.
2. **Text-Based Editor (`<Transcript />`):**
   - Render the EDL as clickable text blocks/sentences.
   - **Styling:** Segments with `keep: true` are dark/normal text. Segments with `keep: false` are grayed out and struck through.
   - **Interactivity:** 
     - Clicking a word/segment seeks the video player to that exact `start` timestamp.
     - Selecting a block of text reveals a floating toolbar with "Cut" and "Keep" buttons, which toggles the `keep` boolean in the global Zustand store.
3. **Timeline Editor (`<Timeline />`):**
   - Visual representation of the video duration.
   - Render green blocks for `keep: true` and red/gray blocks for `keep: false`.
   - **Micro-adjustments:** Users can drag the left/right handles of a green block to adjust the `start`/`end` timestamps by milliseconds (useful for fixing cut-off breaths).

### Phase 3: Export & Rendering Pipeline
1. **Export Settings Modal (`<ExportModal />`):**
   - **Resolution:** Original, 1080p, 720p.
   - **Video Codec:** H.264 (libx264), H.265/HEVC (libx265).
   - **Quality (CRF):** High (18), Medium (23), Low (28).
   - **Framerate:** Original, 30fps, 60fps.
2. **Rendering Engine (`/api/export`):**
   - Receive the final EDL (only `keep: true` segments) and export settings from the frontend.
   - **FFmpeg Strategy:** Generate an FFmpeg `concat` demuxer text file (`file.txt`) containing the precise `inpoint` and `outpoint` directives for each segment, OR use the `trim` and `atrim` complex filters. The `concat` file is usually faster and avoids re-encoding if settings match the original, but since we apply custom encoding settings, re-encoding is expected.
   - Execute the FFmpeg process asynchronously (`asyncio.create_subprocess_exec`).
3. **Progress Tracking (WebSockets):**
   - Parse FFmpeg's `stderr` output to calculate the current frame / total frames.
   - Send progress updates (0% to 100%) to the frontend via WebSockets or Server-Sent Events (SSE).

## 📂 4. Target Project Architecture
```text
auto_caster/
│
├── backend/
│   ├── main.py                 # FastAPI app initialization & routing
│   ├── api/
│   │   ├── upload.py           # File handling
│   │   ├── process.py          # Whisper & NVIDIA NIM orchestration
│   │   └── export.py           # FFmpeg execution & WebSockets/SSE
│   ├── services/
│   │   ├── transcriber.py      # OpenAI Whisper logic
│   │   ├── ai_analyzer.py      # LLM Prompting & EDL generation
│   │   └── video_renderer.py   # FFmpeg command builder
│   ├── data/                   # Local storage for uploads & exports
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── VideoPlayer.tsx # Skip-logic implementation
│   │   │   ├── Transcript.tsx  # Interactive text blocks
│   │   │   ├── Timeline.tsx    # Drag-and-drop handles
│   │   │   └── ExportModal.tsx # Options GUI
│   │   ├── store/
│   │   │   └── useEditorStore.ts # Zustand global state
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
```

## 👣 5. Step-by-Step Implementation Guide (For the AI)
- **Step 1: Scaffolding.** Setup the FastAPI backend structure and the React Vite frontend. Establish CORS and basic routing.
- **Step 2: Media Ingestion.** Implement the upload endpoint and the basic Whisper transcription service. Return raw JSON.
- **Step 3: AI Filtering.** Integrate the NVIDIA Llama 3.1 API. Write the data-prep logic to send the JSON and parse the LLM's array response safely.
- **Step 4: Frontend State.** Create the Zustand store holding the EDL array. Build the Video Player with the `timeupdate` hook to skip `keep: false` sections.
- **Step 5: Transcript UI.** Build the text interface. Ensure clicking text updates the player time, and toggling state updates the global store.
- **Step 6: Timeline UI.** Implement the visual timeline with draggable segment boundaries.
- **Step 7: FFmpeg Export.** Write the Python logic to convert the EDL into FFmpeg commands. Apply the user's resolution/codec settings. Implement SSE/WS for progress tracking.

## ⚠️ 6. Strict Technical Constraints
- Do not block the FastAPI main thread. Use `asyncio` for FFmpeg subprocesses and `BackgroundTasks` or ThreadPools for Whisper transcription.
- Ensure the JSON payload sent to the LLM is minimized (strip timestamps, send only ID and Text) to save tokens and ensure reliable JSON output.
- FFmpeg cuts must be frame-accurate where possible. Use `-ss` and `-to` carefully.
