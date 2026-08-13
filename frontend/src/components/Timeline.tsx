/**
 * Timeline Component
 * Visual timeline editor using wavesurfer.js
 * 
 * Features:
 * - Waveform background
 * - Green/red regions for kept/removed segments
 * - Draggable handles for precise adjustments
 * - Click-to-seek
 * - Playhead sync with player
 */

import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions';
import type { Region } from 'wavesurfer.js/dist/plugins/regions';
import { useEditorStore, selectEDL, selectCurrentTime, selectJobId } from '../store/useEditorStore';

interface SilenceRegion {
  start: number;
  end: number;
}

/**
 * Compute silence regions from audio buffer data.
 * Divides audio into frames, calculates RMS amplitude per frame,
 * and groups consecutive low-amplitude frames into silence regions.
 */
const computeSilenceRegions = (audioBuffer: AudioBuffer): SilenceRegion[] => {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;

  // Limit total frames to ~3000 for performance on long files
  const targetFrames = 3000;
  const frameSize = Math.max(
    Math.floor(sampleRate * 0.1), // minimum 100ms per frame
    Math.floor(channelData.length / targetFrames)
  );

  const threshold = 0.02; // RMS threshold below which audio is considered silence
  const minSilenceDuration = 0.3; // minimum silence length in seconds

  const silenceRanges: SilenceRegion[] = [];
  let currentStart: number | null = null;

  for (let i = 0; i < channelData.length; i += frameSize) {
    const end = Math.min(i + frameSize, channelData.length);

    // Compute RMS, sampling at most ~1000 points per frame for speed
    let sum = 0;
    const step = Math.max(1, Math.floor((end - i) / 1000));
    let count = 0;
    for (let j = i; j < end; j += step) {
      const val = channelData[j];
      sum += val * val;
      count++;
    }
    const rms = count > 0 ? Math.sqrt(sum / count) : 0;

    const frameStart = i / sampleRate;
    const frameEnd = end / sampleRate;

    if (rms < threshold) {
      if (currentStart === null) {
        currentStart = frameStart;
      }
    } else {
      if (currentStart !== null) {
        if (frameStart - currentStart >= minSilenceDuration) {
          silenceRanges.push({ start: currentStart, end: frameStart });
        }
        currentStart = null;
      }
    }

    if (frameEnd >= duration) break;
  }

  // Handle trailing silence
  if (currentStart !== null && duration - currentStart >= minSilenceDuration) {
    silenceRanges.push({ start: currentStart, end: duration });
  }

  return silenceRanges;
};

/**
 * Remove portions of silence regions that overlap with "keep" segments,
 * so silence is only shown in gaps where the speaker is not talking.
 */
const filterOverlappingKeep = (
  silenceRegions: SilenceRegion[],
  edl: { id: number; start: number; end: number; keep: boolean }[]
): SilenceRegion[] => {
  const keptSegments = edl.filter(s => s.keep);
  if (keptSegments.length === 0) return silenceRegions;

  const result: SilenceRegion[] = [];
  const minVisibleLength = 0.3;

  for (const silence of silenceRegions) {
    let cursor = silence.start;

    const overlapping = keptSegments
      .filter(s => s.start < silence.end && s.end > silence.start)
      .sort((a, b) => a.start - b.start);

    for (const seg of overlapping) {
      if (seg.start > cursor) {
        const gapEnd = Math.min(seg.start, silence.end);
        if (gapEnd - cursor >= minVisibleLength) {
          result.push({ start: cursor, end: gapEnd });
        }
      }
      cursor = Math.max(cursor, seg.end);
      if (cursor >= silence.end) break;
    }

    if (cursor < silence.end && silence.end - cursor >= minVisibleLength) {
      result.push({ start: cursor, end: silence.end });
    }
  }

  return result;
};

export function Timeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<RegionsPlugin | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [silenceRegions, setSilenceRegions] = useState<SilenceRegion[]>([]);
  
  const edl = useEditorStore(selectEDL);
  const currentTime = useEditorStore(selectCurrentTime);
  const jobId = useEditorStore(selectJobId);
  const { seek, updateSegmentTimes, setDuration } = useEditorStore();

  // Store latest EDL in ref for callback access
  const edlRef = useRef(edl);
  useEffect(() => {
    edlRef.current = edl;
  }, [edl]);

  // Initialize wavesurfer with retry for audio-not-ready (404)
  useEffect(() => {
    if (!containerRef.current || !jobId) return;

    const regionsPlugin = RegionsPlugin.create();
    regionsPluginRef.current = regionsPlugin;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#93c5fd',
      progressColor: '#3b82f6',
      cursorColor: '#ef4444',
      cursorWidth: 2,
      height: 80,
      barWidth: 2,
      barGap: 1,
      plugins: [regionsPlugin],
      url: `/api/upload/${jobId}/audio-file`,
      dragToSeek: false, // We handle click-to-seek manually
      autoScroll: true,
      normalize: true,
    });
    wsRef.current = ws;

    setIsLoading(true);

    // Retry loading audio if it's not ready yet (e.g. extraction still in progress).
    // Keeps retrying every 2s for up to MAX_ATTEMPTS times.
    let retryAttempts = 0;
    const MAX_RETRY_ATTEMPTS = 60; // 60 * 2s = 120s max wait
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const tryLoadAudio = () => {
      if (wsRef.current) {
        wsRef.current.load(`/api/upload/${jobId}/audio-file`);
      }
    };

    ws.on('ready', () => {
      setIsLoading(false);
      setIsReady(true);
      retryAttempts = 0;
      const duration = ws.getDuration();
      if (duration) setDuration(duration);

      // Analyze audio data to detect silence/noise regions
      const decoded = ws.getDecodedData();
      if (decoded) {
        // Use setTimeout to avoid blocking the UI during analysis
        setTimeout(() => {
          const regions = computeSilenceRegions(decoded);
          setSilenceRegions(regions);
        }, 0);
      }
    });

    ws.on('error', () => {
      // Audio not ready yet — retry with backoff
      retryAttempts += 1;
      if (retryAttempts < MAX_RETRY_ATTEMPTS) {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          tryLoadAudio();
        }, 2000);
      } else {
        setIsLoading(false);
        setIsReady(true);
      }
    });

    // Click to seek (only when not dragging a region edge)
    ws.on('interaction', () => {
      const time = ws.getCurrentTime();
      seek(time);
    });

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      ws.destroy();
      wsRef.current = null;
      regionsPluginRef.current = null;
      setIsReady(false);
      setSilenceRegions([]);
    };
  }, [jobId, seek, setDuration]);

  // Render regions when EDL or readiness changes
  useEffect(() => {
    if (!isReady || !regionsPluginRef.current) return;

    const plugin = regionsPluginRef.current;
    plugin.clearRegions();

    // Render silence regions first (behind EDL segments)
    const visibleSilence = filterOverlappingKeep(silenceRegions, edl);
    visibleSilence.forEach((region, i) => {
      plugin.addRegion({
        id: `sil-${i}`,
        start: region.start,
        end: region.end,
        color: 'rgba(250, 204, 21, 0.15)',  // yellow - silence/noise
        drag: false,
        resize: false,
        minLength: 0.2,
      });
    });

    // Render EDL segments on top
    edl.forEach((segment) => {
      const color = segment.keep 
        ? 'rgba(34, 197, 94, 0.3)'   // green
        : 'rgba(239, 68, 68, 0.25)';  // red

      plugin.addRegion({
        id: `seg-${segment.id}`,
        start: segment.start,
        end: segment.end,
        color,
        drag: false,
        resize: true,  // Enable drag handles
        minLength: 0.5,
      });
    });
  }, [edl, isReady, silenceRegions]);

  // Handle region updates (drag handles)
  useEffect(() => {
    const plugin = regionsPluginRef.current;
    if (!plugin) return;

    const handleRegionUpdated = (region: Region) => {
      const id = parseInt(region.id.replace('seg-', ''), 10);
      if (isNaN(id)) return;

      const segment = edlRef.current.find(s => s.id === id);
      if (!segment) return;

      // Only update if changed significantly (avoid infinite loops)
      const newStart = region.start;
      const newEnd = region.end;
      
      if (Math.abs(newStart - segment.start) > 0.01) {
        updateSegmentTimes(id, newStart);
      }
      if (Math.abs(newEnd - segment.end) > 0.01) {
        updateSegmentTimes(id, undefined, newEnd);
      }
    };

    plugin.on('region-updated', handleRegionUpdated);
    return () => {
      plugin.un('region-updated', handleRegionUpdated);
    };
  }, [isReady, updateSegmentTimes]);

  // Sync playhead with player currentTime
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !isReady) return;

    // Only set time if difference is significant to avoid loops
    const wsTime = ws.getCurrentTime();
    if (Math.abs(wsTime - currentTime) > 0.15) {
      ws.setTime(currentTime);
    }
  }, [currentTime, isReady]);

  const formatTime = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const keptCount = edl.filter(s => s.keep).length;
  const removedCount = edl.length - keptCount;

  return (
    <div className="flex flex-col space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Timeline
        </h3>
        <div className="flex items-center space-x-4 text-xs">
          <span className="flex items-center space-x-1">
            <span className="w-3 h-3 bg-green-500 rounded-sm"></span>
            <span className="text-gray-600 dark:text-gray-400">{keptCount} kept</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-3 h-3 bg-red-400 rounded-sm"></span>
            <span className="text-gray-600 dark:text-gray-400">{removedCount} removed</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-3 h-3 bg-yellow-400/20 border border-yellow-400 rounded-sm"></span>
            <span className="text-gray-600 dark:text-gray-400">silence</span>
          </span>
        </div>
      </div>

      {/* Waveform Container */}
      <div className="relative h-24 bg-gray-900 dark:bg-gray-800 rounded-lg overflow-hidden">
        <div ref={containerRef} className="w-full h-full" />
        
        {!jobId && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            Upload a video to load the timeline
          </div>
        )}
        
        {jobId && isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center space-x-2 text-gray-400 text-sm">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Loading audio...</span>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1">
            <span className="w-3 h-3 bg-green-500/30 border border-green-500 rounded-sm"></span>
            <span>Keep</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-3 h-3 bg-red-400/25 border border-red-400 rounded-sm"></span>
            <span>Remove</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-3 h-3 bg-yellow-400/15 border border-yellow-400 rounded-sm"></span>
            <span>Silence / Noise</span>
          </span>
        </div>
        <span>{formatTime(currentTime)}</span>
      </div>
    </div>
  );
}