/**
 * Transcript Component
 * Virtualized text-based editor with click-to-seek and selection toolbar
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Scissors, Check } from 'lucide-react';
import { useEditorStore, selectEDL } from '../store/useEditorStore';

const ROW_HEIGHT = 32;
const OVERSCAN = 5;

export function Transcript() {
  const { seek, toggleKeep } = useEditorStore();
  const edl = useEditorStore(selectEDL);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<number[]>([]);
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(300);
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure viewport height
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateHeight = () => setViewportHeight(el.clientHeight);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Calculate visible range
  const { startIndex, endIndex } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(edl.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
    return { startIndex: start, endIndex: end };
  }, [scrollTop, viewportHeight, edl.length]);

  const handleSegmentClick = useCallback((segmentId: number, startTime: number) => {
    setSelectedSegmentIds((prev) => {
      const isSelected = prev.includes(segmentId);
      return isSelected ? prev.filter(id => id !== segmentId) : [...prev, segmentId];
    });
    const el = document.querySelector(`[data-segment-id="${segmentId}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect) {
        setToolbarPos({
          x: rect.left - containerRect.left + rect.width / 2,
          y: rect.top - containerRect.top - 40,
        });
      }
    }
    seek(startTime);
  }, [seek]);

  const handleCut = useCallback(() => {
    if (selectedSegmentIds.length > 0) {
      toggleKeep(selectedSegmentIds, false);
      setSelectedSegmentIds([]);
      setToolbarPos(null);
    }
  }, [selectedSegmentIds, toggleKeep]);

  const handleKeep = useCallback(() => {
    if (selectedSegmentIds.length > 0) {
      toggleKeep(selectedSegmentIds, true);
      setSelectedSegmentIds([]);
      setToolbarPos(null);
    }
  }, [selectedSegmentIds, toggleKeep]);

  // Clear selection when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-segment-id]') && !target.closest('[data-toolbar]')) {
        setSelectedSegmentIds([]);
        setToolbarPos(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const keptCount = useMemo(() => edl.filter(s => s.keep).length, [edl]);
  const removedCount = edl.length - keptCount;

  const visibleSegments = useMemo(
    () => edl.slice(startIndex, endIndex),
    [edl, startIndex, endIndex]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Transcript</h2>
        <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
          <span className="flex items-center">
            <span className="w-3 h-3 bg-green-500 rounded-full mr-1"></span>
            Kept: {keptCount}
          </span>
          <span className="flex items-center">
            <span className="w-3 h-3 bg-red-400 rounded-full mr-1"></span>
            Removed: {removedCount}
          </span>
        </div>
      </div>

      {/* Virtualized Transcript Content */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 overflow-y-auto"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        {edl.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-center">
              No transcript available. Upload and transcribe a video to see the transcript.
            </p>
          </div>
        ) : (
          <div style={{ height: edl.length * ROW_HEIGHT, position: 'relative' }}>
            {visibleSegments.map((segment, i) => {
              const actualIndex = startIndex + i;
              const isSelected = selectedSegmentIds.includes(segment.id);
              return (
                <div
                  key={segment.id}
                  style={{
                    position: 'absolute',
                    top: actualIndex * ROW_HEIGHT,
                    left: 0,
                    right: 0,
                    height: ROW_HEIGHT,
                  }}
                  className="flex items-center px-1"
                >
                  <span
                    data-segment-id={segment.id}
                    onClick={() => handleSegmentClick(segment.id, segment.start)}
                    className={`cursor-pointer px-1 py-0.5 rounded transition-colors select-none ${
                      segment.keep
                        ? 'hover:bg-blue-100 dark:hover:bg-blue-900 text-gray-900 dark:text-gray-100'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 line-through hover:bg-gray-300 dark:hover:bg-gray-600'
                    } ${isSelected ? 'bg-blue-200 dark:bg-blue-800' : ''}`}
                    title={`Segment ${segment.id}: ${segment.start.toFixed(1)}s - ${segment.end.toFixed(1)}s`}
                  >
                    {segment.text}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Floating Toolbar */}
        {toolbarPos && selectedSegmentIds.length > 0 && (
          <div
            data-toolbar
            className="absolute z-50 flex items-center space-x-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-3 py-2"
            style={{
              left: toolbarPos.x,
              top: toolbarPos.y,
              transform: 'translateX(-50%)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleCut}
              className="flex items-center space-x-1 px-3 py-1.5 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
              title="Cut (mark as removed)"
            >
              <Scissors className="w-4 h-4" />
              <span className="text-sm font-medium">Cut</span>
            </button>
            <button
              onClick={handleKeep}
              className="flex items-center space-x-1 px-3 py-1.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 rounded hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
              title="Keep (mark as retained)"
            >
              <Check className="w-4 h-4" />
              <span className="text-sm font-medium">Keep</span>
            </button>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 text-center">
        Click a segment to select • Click again to deselect • Cut/Keep via toolbar
      </div>
    </div>
  );
}