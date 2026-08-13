/**
 * Zustand Store for AI Screencast Editor
 * Single source of truth for EDL state, video playback, and UI state
 */

import { create } from 'zustand';
import type { EDLSegment, ExportSettings } from '../types';

interface EditorStore {
  // EDL State
  edl: EDLSegment[];
  jobId: string | null;
  videoUrl: string | null;
  originalFilename: string | null;
  
  // Video Player State
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  videoRef: HTMLVideoElement | null;
  
  // UI State
  selectedSegmentIds: number[];
  isUploading: boolean;
  isProcessing: boolean;
  error: string | null;
  
  // Export Settings
  exportSettings: ExportSettings;
  
  // Actions - EDL
  setEDL: (edl: EDLSegment[]) => void;
  setJobId: (jobId: string | null) => void;
  setVideoUrl: (url: string | null) => void;
  setOriginalFilename: (filename: string | null) => void;
  toggleKeep: (segmentIds: number[], keep: boolean) => void;
  updateSegmentTimes: (id: number, start?: number, end?: number) => void;
  
  // Actions - Video Player
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setVideoRef: (ref: HTMLVideoElement | null) => void;
  seek: (time: number) => void;
  play: () => void;
  pause: () => void;
  
  // Actions - UI
  setSelectedSegmentIds: (ids: number[]) => void;
  setIsUploading: (isUploading: boolean) => void;
  setIsProcessing: (isProcessing: boolean) => void;
  setError: (error: string | null) => void;
  
  // Actions - Export
  setExportSettings: (settings: Partial<ExportSettings>) => void;
  
  // Helpers
  getSegmentAtTime: (time: number) => EDLSegment | undefined;
  getNextSegment: (currentTime: number) => EDLSegment | undefined;
  getSkippedSegmentAtTime: (time: number) => EDLSegment | undefined;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  // Initial State
  edl: [],
  jobId: null,
  videoUrl: null,
  originalFilename: null,
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  videoRef: null,
  selectedSegmentIds: [],
  isUploading: false,
  isProcessing: false,
  error: null,
  exportSettings: {
    resolution: 'original',
    codec: 'libx264',
    crf: 23,
    framerate: 'original',
  },
  
  // EDL Actions
  setEDL: (edl) => set({ edl }),
  setJobId: (jobId) => set({ jobId }),
  setVideoUrl: (url) => set({ videoUrl: url }),
  setOriginalFilename: (filename) => set({ originalFilename: filename }),
  
  toggleKeep: (segmentIds, keep) => set((state) => ({
    edl: state.edl.map((segment) =>
      segmentIds.includes(segment.id)
        ? { ...segment, keep }
        : segment
    ),
  })),
  
  updateSegmentTimes: (id, start, end) => set((state) => ({
    edl: state.edl.map((segment) =>
      segment.id === id
        ? {
            ...segment,
            start: start !== undefined ? start : segment.start,
            end: end !== undefined ? end : segment.end,
          }
        : segment
    ),
  })),
  
  // Video Player Actions
  setCurrentTime: (time) => {
    // Debounce: only update if difference is significant (avoid excessive re-renders)
    const current = get().currentTime;
    if (Math.abs(current - time) > 0.05) {
      set({ currentTime: time });
    }
  },
  setDuration: (duration) => set({ duration }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setVideoRef: (ref) => set({ videoRef: ref }),
  
  seek: (time) => {
    const { videoRef } = get();
    if (videoRef) {
      videoRef.currentTime = time;
      set({ currentTime: time });
    }
  },
  
  play: () => {
    const { videoRef } = get();
    if (videoRef) {
      videoRef.play();
      set({ isPlaying: true });
    }
  },
  
  pause: () => {
    const { videoRef } = get();
    if (videoRef) {
      videoRef.pause();
      set({ isPlaying: false });
    }
  },
  
  // UI Actions
  setSelectedSegmentIds: (ids) => set({ selectedSegmentIds: ids }),
  setIsUploading: (isUploading) => set({ isUploading }),
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setError: (error) => set({ error }),
  
  // Export Actions
  setExportSettings: (settings) =>
    set((state) => ({
      exportSettings: { ...state.exportSettings, ...settings },
    })),
  
  // Helper Methods
  getSegmentAtTime: (time) => {
    const { edl } = get();
    return edl.find((segment) => time >= segment.start && time < segment.end);
  },
  
  getNextSegment: (currentTime) => {
    const { edl } = get();
    return edl.find((segment) => segment.start > currentTime);
  },
  
  getSkippedSegmentAtTime: (time) => {
    const { edl } = get();
    return edl.find(
      (segment) => !segment.keep && time >= segment.start && time < segment.end
    );
  },
}));

// Selectors for performance optimization
export const selectEDL = (state: EditorStore) => state.edl;
export const selectCurrentTime = (state: EditorStore) => state.currentTime;
export const selectIsPlaying = (state: EditorStore) => state.isPlaying;
export const selectJobId = (state: EditorStore) => state.jobId;
export const selectExportSettings = (state: EditorStore) => state.exportSettings;