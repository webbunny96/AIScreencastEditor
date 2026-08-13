/**
 * MainEditor Component - main layout with video player, transcript, and timeline
 */
import { useRef, useCallback, useState } from 'react';
import { Upload, Loader2, Sparkles, Film, Clock } from 'lucide-react';
import { VideoPlayer } from './VideoPlayer';
import { Transcript } from './Transcript';
import { Timeline } from './Timeline';
import { ExportModal } from './ExportModal';
import { useEditorStore } from '../store/useEditorStore';
import { useETA } from '../hooks/useETA';

interface SegmentDTO {
  id: number;
  start: number;
  end: number;
  text: string;
  keep: boolean;
  word_count?: number;
}

// Wait for background audio extraction to complete before transcribing
const waitForAudioReady = async (jobId: string, timeoutMs = 120000, pollIntervalMs = 1000) => {
  const deadline = Date.now() + timeoutMs;
  
  while (Date.now() < deadline) {
    const res = await fetch(`/api/upload/${jobId}/status`);
    if (!res.ok) throw new Error('Failed to check upload status');
    const data = await res.json();
    
    if (data.status === 'completed') return;
    if (data.status === 'failed') {
      throw new Error(data.error || 'Audio extraction failed');
    }
    
    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  
  throw new Error('Timed out waiting for audio extraction to complete');
};

export function MainEditor() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtractingAudio, setIsExtractingAudio] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { setEDL, setJobId, setVideoUrl, setOriginalFilename, edl, jobId, originalFilename } = useEditorStore();
  
  // Estimated remaining time (countdown) for long-running tasks
  // - Upload: based on actual progress percentage
  // - Extract: estimated ~10s for short, up to 60s for long videos
  // - Transcribe: estimated ~30s per minute of video (CPU whisper)
  // - Analyze: LLM analysis ~5s + processing time
  const uploadETA = useETA(isUploading, uploadProgress);
  const extractETA = useETA(isExtractingAudio, null, 60);
  const transcribeETA = useETA(isTranscribing, null, 900);  // 15 min max for very long videos
  const analyzeETA = useETA(isAnalyzing, null, 120);  // 2 min max for LLM

  // Network progress tracking for upload
  const trackUploadProgress = (progress: number) => setUploadProgress(progress);

  const runAnalyze = useCallback(async (targetJobId: string) => {
    try {
      setIsAnalyzing(true); setError(null);
      const res = await fetch('/api/process/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: targetJobId }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Analysis failed');
      const data = await res.json();
      setEDL((data.edl as SegmentDTO[]).map((s) => ({ ...s, word_count: s.word_count ?? 0, keep: s.keep })));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally { setIsAnalyzing(false); }
  }, [setEDL]);

  const runTranscribe = useCallback(async (targetJobId: string) => {
    try {
      setIsTranscribing(true); setError(null);
      const res = await fetch('/api/process/transcribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: targetJobId }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Transcription failed');
      await runAnalyze(targetJobId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Transcription failed');
    } finally { setIsTranscribing(false); }
  }, [runAnalyze]);

  const handleFileSelect = useCallback(async (file: File) => {
    try {
      setError(null); setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      // Track upload progress using XMLHttpRequest for progress events
      const xhr = new XMLHttpRequest();
      const uploadProgressPromise = new Promise<void>((resolve, reject) => {
        xhr.open('POST', '/api/upload/');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            trackUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText);
              reject(new Error(errorData.detail || 'Upload failed'));
            } catch {
              reject(new Error('Upload failed'));
            }
          }
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(formData);
      });
      
      await uploadProgressPromise;
      const res = { ok: true, json: async () => JSON.parse(xhr.responseText) };
      const data = await res.json();
      setUploadProgress(100);
      setJobId(data.job_id);
      setVideoUrl(`/api/upload/${data.job_id}/video`);
      setOriginalFilename(data.filename);
      
      // Wait for background audio extraction to complete
      setIsUploading(false);
      setIsExtractingAudio(true);
      await waitForAudioReady(data.job_id);
      
      // Now safe to transcribe
      await runTranscribe(data.job_id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally { 
      setIsUploading(false);
      setIsExtractingAudio(false);
    }
  }, [setJobId, setVideoUrl, setOriginalFilename, runTranscribe]);

  const handleReset = useCallback(() => {
    setError(null); setEDL([]); setVideoUrl(null); setJobId(null); setOriginalFilename(null);
  }, [setEDL, setVideoUrl, setJobId, setOriginalFilename]);

  const keptCount = edl.filter(s => s.keep).length;
  const removedCount = edl.length - keptCount;

  return (
    <main className="flex-1 flex flex-col min-h-0">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3 min-w-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp4,.mkv,.mov,.avi,.webm"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
                e.target.value = '';
              }}
            />
            {!jobId ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span>{isUploading ? `Uploading ${uploadProgress}%...` : 'Upload Video'}</span>
              </button>
            ) : (
              <div className="flex items-center space-x-2 min-w-0">
                <Film className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-50">{originalFilename}</span>
                <button onClick={handleReset} className="text-xs text-gray-500 hover:text-gray-700 transition-colors">Change</button>
              </div>
            )}
            {isExtractingAudio && (
              <span className="flex items-center space-x-1 text-sm text-amber-600 dark:text-amber-400">
                <Loader2 className="w-3 h-3 animate-spin" /><span>Extracting audio...</span>
                <span className="flex items-center space-x-0.5 ml-1 font-mono text-xs bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                  <Clock className="w-3 h-3" /><span>{extractETA ?? '...'}</span>
                </span>
              </span>
            )}
            {isTranscribing && (
              <span className="flex items-center space-x-1 text-sm text-blue-600 dark:text-blue-400">
                <Loader2 className="w-3 h-3 animate-spin" /><span>Transcribing...</span>
                <span className="flex items-center space-x-0.5 ml-1 font-mono text-xs bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                  <Clock className="w-3 h-3" /><span>{transcribeETA ?? '...'}</span>
                </span>
              </span>
            )}
            {isAnalyzing && (
              <span className="flex items-center space-x-1 text-sm text-purple-600 dark:text-purple-400">
                <Sparkles className="w-3 h-3 animate-spin" /><span>AI Analyzing...</span>
                <span className="flex items-center space-x-0.5 ml-1 font-mono text-xs bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">
                  <Clock className="w-3 h-3" /><span>{analyzeETA ?? '...'}</span>
                </span>
              </span>
            )}
          </div>
          {edl.length > 0 && (
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center"><span className="w-2.5 h-2.5 bg-green-500 rounded-full mr-1"></span>Kept: {keptCount}</span>
                <span className="flex items-center"><span className="w-2.5 h-2.5 bg-red-400 rounded-full mr-1"></span>Removed: {removedCount}</span>
              </div>
              <button
                onClick={() => setIsExportOpen(true)}
                disabled={edl.length === 0}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 text-sm font-medium"
              >
                <Film className="w-4 h-4" /><span>Export Video</span>
              </button>
            </div>
          )}
        </div>
        {/* Upload progress bar */}
        {isUploading && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-blue-600 dark:text-blue-400 flex items-center">
                <Loader2 className="w-3 h-3 animate-spin mr-1" />Uploading...
              </span>
              <span className="flex items-center font-mono text-gray-600 dark:text-gray-400">
                <Clock className="w-3 h-3 mr-1" />{uploadETA ?? '...'} · {uploadProgress}%
              </span>
            </div>
            <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
        {error && (
          <div className="mt-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">✕</button>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 p-4 gap-4 overflow-hidden">
        <div className="flex-1 lg:w-1/2 flex flex-col min-h-0">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-4"><VideoPlayer /></div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4"><Timeline /></div>
        </div>
        <div className="flex-1 lg:w-1/2 flex flex-col min-h-0">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 flex-1 min-h-0"><Transcript /></div>
        </div>
      </div>

      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
    </main>
  );
}