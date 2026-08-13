/**
 * Export Modal Component
 * Video export settings and progress tracking
 */

import { useState, useCallback, useEffect } from 'react';
import { X, Download, Settings, Film, Video, Zap, Clock } from 'lucide-react';
import { useEditorStore, selectEDL } from '../store/useEditorStore';
import { useETA } from '../hooks/useETA';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ResolutionOption = 'original' | '1080p' | '720p';
type CodecOption = 'libx264' | 'libx265';
type FramerateOption = 'original' | '30' | '60';

const RESOLUTION_OPTIONS: { value: ResolutionOption; label: string; description: string }[] = [
  { value: 'original', label: 'Original', description: 'Keep source resolution' },
  { value: '1080p', label: '1080p', description: '1920×1080 Full HD' },
  { value: '720p', label: '720p', description: '1280×720 HD' },
];

const CODEC_OPTIONS: { value: CodecOption; label: string; description: string }[] = [
  { value: 'libx264', label: 'H.264', description: 'Most compatible' },
  { value: 'libx265', label: 'H.265/HEVC', description: 'Better compression' },
];

const FRAMERATE_OPTIONS: { value: FramerateOption; label: string; description: string }[] = [
  { value: 'original', label: 'Original', description: 'Keep source framerate' },
  { value: '30', label: '30 fps', description: 'Standard video' },
  { value: '60', label: '60 fps', description: 'Smooth motion' },
];

const CRF_OPTIONS: { value: number; label: string; description: string }[] = [
  { value: 18, label: 'High', description: 'Best quality, larger file' },
  { value: 23, label: 'Medium', description: 'Balanced quality/size' },
  { value: 28, label: 'Low', description: 'Smaller file, lower quality' },
];

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const {
    setExportSettings,
    exportSettings,
    jobId,
  } = useEditorStore();
  
  const edl = useEditorStore(selectEDL);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState<string>('');
  const [exportId, setExportId] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const exportETA = useETA(isExporting, exportProgress);
  
  // Calculate estimated file size (rough estimate)
  const calculateEstimatedSize = () => {
    const keptDuration = edl
      .filter(s => s.keep)
      .reduce((sum, s) => sum + (s.end - s.start), 0);
    
    // Rough bitrate estimates (kbps)
    const bitrateMap: Record<number, number> = {
      18: 8000,  // High quality
      23: 4500,  // Medium
      28: 2500,  // Low
    };
    
    const bitrate = bitrateMap[exportSettings.crf] || 4500;
    const sizeInMb = (keptDuration * bitrate) / (8 * 1024);
    
    if (sizeInMb > 1024) {
      return `${(sizeInMb / 1024).toFixed(1)} GB`;
    }
    return `${sizeInMb.toFixed(0)} MB`;
  };
  
  const handleSettingChange = (
    setting: 'resolution' | 'codec' | 'crf' | 'framerate',
    value: string | number
  ) => {
    setExportSettings({ [setting]: value });
  };
  
  const handleExport = useCallback(async () => {
    if (!jobId || edl.length === 0) return;
    
    setIsExporting(true);
    setExportProgress(0);
    setExportStatus('Starting export...');
    setIsComplete(false);
    
    try {
      // Call export API
      const res = await fetch('/api/export/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          segments: edl.map(s => ({
            id: s.id,
            start: s.start,
            end: s.end,
            text: s.text,
            keep: s.keep,
          })),
          settings: exportSettings,
        }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Export failed');
      }
      
      const data = await res.json();
      setExportId(data.export_id);
      setExportStatus('Export started. Processing video...');
      
      // Listen to SSE progress
      const es = new EventSource(`/api/export/${data.export_id}/progress`);
      
      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (typeof data.progress === 'number') {
          setExportProgress(data.progress);
        }
        
        if (data.status === 'completed') {
          setExportStatus('Export complete!');
          setExportProgress(100);
          setIsComplete(true);
          es.close();
          
          // Auto-close after completion
          setTimeout(() => {
            setIsExporting(false);
            onClose();
          }, 2000);
        } else if (data.status === 'failed') {
          setExportStatus(data.error || 'Export failed');
          es.close();
          setIsExporting(false);
        } else if (data.status === 'processing') {
          setExportStatus(`Processing: ${data.progress}%`);
        }
      };
      
      es.onerror = () => {
        es.close();
        setExportStatus('Connection lost. Check export status.');
        setIsExporting(false);
      };
      
    } catch (error: unknown) {
      setExportStatus(error instanceof Error ? error.message : 'Export failed. Please try again.');
      setIsExporting(false);
    }
  }, [jobId, edl, exportSettings, onClose]);
  
  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (exportId) {
        new EventSource(`/api/export/${exportId}/progress`).close();
      }
    };
  }, [exportId]);
  
  if (!isOpen) return null;
  
  const keptSegments = edl.filter(s => s.keep);
  const totalDuration = keptSegments.reduce((sum, s) => sum + (s.end - s.start), 0);
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
            <Film className="w-5 h-5 mr-2" />
            Export Video
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Summary */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Export Summary
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Segments to export</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {keptSegments.length} of {edl.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Output duration</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {Math.floor(totalDuration / 60)}:{(Math.floor(totalDuration) % 60).toString().padStart(2, '0')}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Est. file size</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {calculateEstimatedSize()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Content kept</p>
                <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                  {edl.length > 0 ? Math.round((keptSegments.length / edl.length) * 100) : 0}%
                </p>
              </div>
            </div>
          </div>
          
          {/* Resolution */}
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              <Video className="w-4 h-4 mr-2" />
              Resolution
            </label>
            <div className="grid grid-cols-3 gap-3">
              {RESOLUTION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSettingChange('resolution', option.value)}
                  className={`
                    p-3 rounded-lg border-2 text-left transition-colors
                    ${exportSettings.resolution === option.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }
                  `}
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {option.label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {option.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
          
          {/* Codec */}
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              <Settings className="w-4 h-4 mr-2" />
              Video Codec
            </label>
            <div className="grid grid-cols-2 gap-3">
              {CODEC_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSettingChange('codec', option.value)}
                  className={`
                    p-3 rounded-lg border-2 text-left transition-colors
                    ${exportSettings.codec === option.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }
                  `}
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {option.label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {option.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
          
          {/* Quality (CRF) */}
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              <Zap className="w-4 h-4 mr-2" />
              Quality (CRF)
            </label>
            <div className="grid grid-cols-3 gap-3">
              {CRF_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSettingChange('crf', option.value)}
                  className={`
                    p-3 rounded-lg border-2 text-left transition-colors
                    ${exportSettings.crf === option.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }
                  `}
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {option.label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    CRF {option.value}
                  </p>
                </button>
              ))}
            </div>
          </div>
          
          {/* Framerate */}
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              <Clock className="w-4 h-4 mr-2" />
              Framerate
            </label>
            <div className="grid grid-cols-3 gap-3">
              {FRAMERATE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSettingChange('framerate', option.value)}
                  className={`
                    p-3 rounded-lg border-2 text-left transition-colors
                    ${exportSettings.framerate === option.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }
                  `}
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {option.label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {option.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
          
          {/* Progress */}
          {isExporting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">{exportStatus}</span>
                <span className="flex items-center font-mono text-xs text-gray-500 dark:text-gray-400 space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>{(exportETA ?? '...')}</span>
                  <span className="mx-1">·</span>
                  <span className="font-medium text-gray-900 dark:text-white">{exportProgress}%</span>
                </span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          {isComplete && exportId ? (
            <a
              href={`/api/export/download/${exportId}`}
              className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Video
            </a>
          ) : (
            <button
              onClick={handleExport}
              disabled={isExporting || keptSegments.length === 0}
              className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? 'Exporting...' : 'Export Video'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}