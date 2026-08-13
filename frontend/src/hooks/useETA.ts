/**
 * useETA Hook
 * Estimates remaining time (countdown) for a running task.
 *
 * - If `progress` is provided (0-100), remaining = elapsed * (100 - progress) / progress
 * - If `estimatedTotalSeconds` is provided (task without progress), remaining = estimatedTotalSeconds - elapsed
 * - Otherwise returns null (unknown ETA)
 *
 * Returns a formatted string like "≈ 3:25" or null.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export function useETA(
  isRunning: boolean,
  progress: number | null = null,
  estimatedTotalSeconds?: number
): string | null {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    startTimeRef.current = null;
  }, []);

  useEffect(() => {
    if (isRunning) {
      startTimeRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const seconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
          setElapsedSeconds(seconds);
        }
      }, 1000);
    } else {
      stopTimer();
    }

    return () => {
      stopTimer();
    };
  }, [isRunning, stopTimer]);

  // Compute remaining seconds
  let remainingSeconds: number | null = null;

  if (isRunning) {
    if (progress !== null && progress > 0) {
      // ETA from progress: elapsed / progress * (100 - progress)
      remainingSeconds = Math.round((elapsedSeconds / progress) * (100 - progress));
    } else if (estimatedTotalSeconds !== undefined) {
      // ETA from estimated total duration
      remainingSeconds = Math.max(0, Math.round(estimatedTotalSeconds - elapsedSeconds));
    }
  }

  if (remainingSeconds === null || remainingSeconds === undefined) {
    return null;
  }

  // Format as "≈ M:SS"
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  return `≈ ${mins}:${secs.toString().padStart(2, '0')}`;
}