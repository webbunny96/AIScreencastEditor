/**
 * TypeScript types for AI Screencast Editor
 */

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface EDLSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  word_count?: number;
  words?: WordTimestamp[];
  keep: boolean;
  reason?: string | null;
}

export interface ExportSettings {
  resolution: 'original' | '1080p' | '720p';
  codec: 'libx264' | 'libx265';
  crf: number;
  framerate: 'original' | '30' | '60';
}

export interface JobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'transcribed' | 'analyzed' | 'completed' | 'failed';
  filename?: string;
  has_audio?: boolean;
  has_transcription?: boolean;
  transcription?: TranscriptionResult;
  edl?: EDLSegment[];
  error?: string;
}

export interface TranscriptionResult {
  segments: TranscriptSegment[];
  duration: number;
  language: string;
  total_segments: number;
}

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  word_count: number;
  words?: WordTimestamp[];
}

export interface AnalysisResult {
  job_id: string;
  edl: EDLSegment[];
  stats: {
    total_segments: number;
    kept_segments: number;
    removed_segments: number;
    total_duration: number;
    kept_duration: number;
    removed_duration: number;
    kept_percentage: number;
  };
}

export interface UploadResponse {
  job_id: string;
  filename: string;
  filepath: string;
  audio_extracted: boolean;
  message: string;
}

export interface ExportResponse {
  export_id: string;
  job_id: string;
  status: string;
  message: string;
  download_url?: string;
}