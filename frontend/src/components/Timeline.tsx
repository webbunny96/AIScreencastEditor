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

export function Timeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<RegionsPlugin | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const edl = useEditorStore(selectEDL);
  const currentTime = useEditorStore(selectCurrentTime);
  const jobId = useEditorStore(selectJobId);
  const { seek, updateSegmentTimes, setDuration } = useEditorStore();

  // Store latest EDL in ref for callback access
  const edlRef = useRef(edl);
  useEffect(() => {
    edlRef.current = edl;
  }, [edl]);

  // Initialize wavesurfer
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

    ws.on('ready', () => {
      setIsLoading(false);
      setIsReady(true);
      const duration = ws.getDuration();
      if (duration) setDuration(duration);
    });

    ws.on('error', () => {
      setIsLoading(false);
      setIsReady(true);
    });

    // Click to seek (only when not dragging a region edge)
    ws.on('interaction', () => {
      const time = ws.getCurrentTime();
      seek(time);
    });

    return () => {
      ws.destroy();
      wsRef.current = null;
      regionsPluginRef.current = null;
      setIsReady(false);
    };
  }, [jobId, seek, setDuration]);

  // Render regions when EDL or readiness changes
  useEffect(() => {
    if (!isReady || !regionsPluginRef.current) return;

    const plugin = regionsPluginRef.current;
    plugin.clearRegions();

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
  }, [edl, isReady]);

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
        </div>
        <span>{formatTime(currentTime)}</span>
      </div>
    </div>
  );
}