/**
 * MainEditor Component - main layout with video player, transcript, and timeline
 */
import { useRef, useCallback, useState } from 'react';
import { Upload, Loader2, Sparkles, Film } from 'lucide-react';
import { VideoPlayer } from './VideoPlayer';
import { Transcript } from './Transcript';
import { Timeline } from './Timeline';
import { ExportModal } from './ExportModal';
import { useEditorStore } from '../store/useEditorStore';

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
  const { setEDL, setJobId, setVideoUrl, setOriginalFilename, edl, jobId, originalFilename } = useEditorStore();

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
      const res = await fetch('/api/upload/', { method: 'POST', body: formData });
      if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');
      const data = await res.json();
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
                <span>{isUploading ? 'Uploading...' : 'Upload Video'}</span>
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
              </span>
            )}
            {isTranscribing && (
              <span className="flex items-center space-x-1 text-sm text-blue-600 dark:text-blue-400">
                <Loader2 className="w-3 h-3 animate-spin" /><span>Transcribing...</span>
              </span>
            )}
            {isAnalyzing && (
              <span className="flex items-center space-x-1 text-sm text-purple-600 dark:text-purple-400">
                <Sparkles className="w-3 h-3 animate-spin" /><span>AI Analyzing...</span>
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