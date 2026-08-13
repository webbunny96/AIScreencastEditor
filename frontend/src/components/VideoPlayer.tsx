/**
 * VideoPlayer Component
 * Smart video player with skip logic for removed segments
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack } from 'lucide-react';
import { useEditorStore, selectCurrentTime, selectIsPlaying, selectEDL } from '../store/useEditorStore';

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [hasVideo, setHasVideo] = useState(false);
  
  const {
    setVideoRef,
    setCurrentTime,
    setIsPlaying,
    seek,
    play,
    pause,
    getSkippedSegmentAtTime,
    videoUrl,
  } = useEditorStore();
  
  const currentTime = useEditorStore(selectCurrentTime);
  const isPlaying = useEditorStore(selectIsPlaying);
  const edl = useEditorStore(selectEDL);
  
  // Handle time updates with skip logic
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    
    const time = videoRef.current.currentTime;
    setCurrentTime(time);
    
    // Skip logic: if we're in a removed segment, jump to the end of it
    const skippedSegment = getSkippedSegmentAtTime(time);
    if (skippedSegment) {
      videoRef.current.currentTime = skippedSegment.end;
    }
  }, [setCurrentTime, getSkippedSegmentAtTime]);
  
  // Handle play/pause state changes
  const handlePlay = useCallback(() => {
    setIsPlaying(true);
  }, [setIsPlaying]);
  
  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, [setIsPlaying]);
  
  // Handle duration change
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const duration = videoRef.current.duration;
      setVideoDuration(duration);
      setVideoRef(videoRef.current);
      setHasVideo(true);
    }
  }, [setVideoRef]);
  
  // Set up event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [handleTimeUpdate, handlePlay, handlePause, handleLoadedMetadata]);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (isPlaying) {
            pause();
          } else {
            play();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seek(Math.max(0, currentTime - 5));
          break;
        case 'ArrowRight':
          e.preventDefault();
          seek(Math.min(videoDuration, currentTime + 5));
          break;
        case 'j':
          e.preventDefault();
          seek(Math.max(0, currentTime - 10));
          break;
        case 'l':
          e.preventDefault();
          seek(Math.min(videoDuration, currentTime + 10));
          break;
        case 'k':
          e.preventDefault();
          if (isPlaying) {
            pause();
          } else {
            play();
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, isPlaying, videoDuration, play, pause, seek]);
  
  // Format time as MM:SS
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // Calculate progress percentage
  const progress = videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0;
  
  return (
    <div className="flex flex-col space-y-4">
      {/* Video Container */}
      <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
        <video
          ref={videoRef}
          className="w-full h-full"
          playsInline
          preload="metadata"
          src={videoUrl || undefined}
        >
          Your browser does not support the video tag.
        </video>
        
        {/* Overlay when no video */}
        {!hasVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center text-gray-400">
              <p className="text-lg mb-2">No video loaded</p>
              <p className="text-sm">Upload a video to get started</p>
            </div>
          </div>
        )}
      </div>
      
      {/* Video Controls */}
      <div className="flex items-center justify-center space-x-4">
        <button
          onClick={() => seek(Math.max(0, currentTime - 5))}
          className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          title="Rewind 5s (←)"
        >
          <SkipBack className="w-5 h-5" />
        </button>
        
        <button
          onClick={() => isPlaying ? pause() : play()}
          className="p-3 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? (
            <Pause className="w-6 h-6" />
          ) : (
            <Play className="w-6 h-6" />
          )}
        </button>
        
        <button
          onClick={() => seek(Math.min(videoDuration, currentTime + 5))}
          className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          title="Forward 5s (→)"
        >
          <SkipForward className="w-5 h-5" />
        </button>
      </div>
      
      {/* Time Display & Progress */}
      <div className="flex items-center space-x-3">
        <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">
          {formatTime(currentTime)}
        </span>
        
        {/* Progress Bar */}
        <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          {/* EDL Visualization */}
          <div className="relative w-full h-full">
            {edl.map((segment) => {
              const left = videoDuration > 0 ? (segment.start / videoDuration) * 100 : 0;
              const width = videoDuration > 0 ? ((segment.end - segment.start) / videoDuration) * 100 : 0;
              
              return (
                <div
                  key={segment.id}
                  className={`absolute h-full ${
                    segment.keep ? 'bg-green-500' : 'bg-red-400 opacity-50'
                  }`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={segment.keep ? 'Kept' : 'Removed'}
                />
              );
            })}
            
            {/* Playhead */}
            <div
              className="absolute h-full w-1 bg-blue-600 transition-all duration-100"
              style={{ left: `${progress}%` }}
            />
          </div>
        </div>
        
        <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">
          {formatTime(videoDuration)}
        </span>
      </div>
      
      {/* Keyboard Shortcuts Info */}
      <div className="flex justify-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
        <span>Space: Play/Pause</span>
        <span>←/→: ±5s</span>
        <span>J/K/L: -10s/Pause/+10s</span>
      </div>
    </div>
  );
}