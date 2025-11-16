/**
 * Enhanced Report Issue Button - Full-Featured Bug Reporting
 *
 * Features:
 * - Modal dialog with description field
 * - Screenshot capture and annotation
 * - Flexible metadata for user context
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import { logger } from '../utils/observability/logger';
import type { IssueReportRequest, IssueReportApiResponse } from '../../../shared/api-contracts';
import { AlertCircle, CheckCircle, X, Pen, Square, Circle, Type, Undo } from 'lucide-react';

// Annotation types
type AnnotationTool = 'rectangle' | 'circle' | 'text';

interface Annotation {
  type: AnnotationTool;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
}

interface ReportIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: IssueReportRequest) => Promise<void>;
}

function ReportIssueModal({ isOpen, onClose, onSubmit }: ReportIssueModalProps) {
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotatedScreenshot, setAnnotatedScreenshot] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Annotation state
  const [currentTool, setCurrentTool] = useState<AnnotationTool>('rectangle');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isDrawingShape, setIsDrawingShape] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentShape, setCurrentShape] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isAddingText, setIsAddingText] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textPosition, setTextPosition] = useState<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setDescription('');
      setScreenshot(null);
      setScreenshotError(null);
      setIsCapturing(false);
      setIncludeScreenshot(true);
      setIsAnnotating(false);
      setAnnotatedScreenshot(null);
      setIsSubmitting(false);
      setSubmitError(null);
      setAnnotations([]);
      setCurrentTool('rectangle');
      setIsDrawingShape(false);
      setStartPoint(null);
      setCurrentShape(null);
      setIsAddingText(false);
      setTextInput('');
      setTextPosition(null);
    }
  }, [isOpen]);

  // Handle ESC key and body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };

    // Lock body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, isSubmitting, onClose]);

  const captureScreenshot = useCallback(async () => {
    setIsCapturing(true);
    setScreenshotError(null);

    try {
      // Wait briefly for modal to hide
      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = await html2canvas(document.body, {
        allowTaint: true,
        useCORS: true,
        logging: false,
        scale: 0.5, // Reduce file size
      });

      const dataUrl = canvas.toDataURL('image/png', 0.8);
      setScreenshot(dataUrl);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to capture screenshot', 'ReportIssueModal', error as Error);
      setScreenshotError(`Screenshot capture failed: ${errorMessage}`);
    } finally {
      setIsCapturing(false);
    }
  }, []);

  // Capture screenshot when modal opens
  useEffect(() => {
    if (isOpen && !screenshot && !isCapturing) {
      captureScreenshot();
    }
  }, [isOpen, screenshot, isCapturing, captureScreenshot]);

  // Render canvas with screenshot and annotations
  const renderCanvas = useCallback(() => {
    if (!canvasRef.current || !screenshot) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw screenshot
      ctx.drawImage(img, 0, 0);

      // Draw all annotations
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 3;
      ctx.fillStyle = '#ff0000';
      ctx.font = '24px sans-serif';

      annotations.forEach(annotation => {
        if (annotation.type === 'rectangle' && annotation.width && annotation.height) {
          ctx.strokeRect(annotation.x, annotation.y, annotation.width, annotation.height);
        } else if (annotation.type === 'circle' && annotation.width && annotation.height) {
          const centerX = annotation.x + annotation.width / 2;
          const centerY = annotation.y + annotation.height / 2;
          const radiusX = Math.abs(annotation.width / 2);
          const radiusY = Math.abs(annotation.height / 2);

          ctx.beginPath();
          ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
          ctx.stroke();
        } else if (annotation.type === 'text' && annotation.text) {
          ctx.fillText(annotation.text, annotation.x, annotation.y);
        }
      });

      // Draw current shape being drawn
      if (currentShape && currentTool !== 'text') {
        if (currentTool === 'rectangle') {
          ctx.strokeRect(currentShape.x, currentShape.y, currentShape.width, currentShape.height);
        } else if (currentTool === 'circle') {
          const centerX = currentShape.x + currentShape.width / 2;
          const centerY = currentShape.y + currentShape.height / 2;
          const radiusX = Math.abs(currentShape.width / 2);
          const radiusY = Math.abs(currentShape.height / 2);

          ctx.beginPath();
          ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }
    };
    img.src = screenshot;
  }, [screenshot, annotations, currentShape, currentTool]);

  // Load screenshot and render canvas when annotating
  useEffect(() => {
    if (isAnnotating) {
      renderCanvas();
    }
  }, [isAnnotating, renderCanvas]);

  // Get canvas coordinates from mouse event
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasRef.current.width / rect.width),
      y: (e.clientY - rect.top) * (canvasRef.current.height / rect.height),
    };
  };

  // Handle mouse down for shape drawing
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isAnnotating || isAddingText) return;

    const coords = getCanvasCoords(e);

    if (currentTool === 'text') {
      // Place text annotation
      setTextPosition(coords);
      setIsAddingText(true);
      setTimeout(() => textInputRef.current?.focus(), 0);
    } else {
      // Start drawing shape
      setIsDrawingShape(true);
      setStartPoint(coords);
      setCurrentShape({ x: coords.x, y: coords.y, width: 0, height: 0 });
    }
  };

  // Handle mouse move for shape drawing
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingShape || !startPoint) return;

    const coords = getCanvasCoords(e);
    const width = coords.x - startPoint.x;
    const height = coords.y - startPoint.y;

    setCurrentShape({
      x: width < 0 ? coords.x : startPoint.x,
      y: height < 0 ? coords.y : startPoint.y,
      width: Math.abs(width),
      height: Math.abs(height),
    });

    renderCanvas();
  };

  // Handle mouse up to finish shape
  const handleMouseUp = () => {
    if (!isDrawingShape || !currentShape || !startPoint) return;

    // Only add shape if it has meaningful size
    if (Math.abs(currentShape.width) > 5 && Math.abs(currentShape.height) > 5) {
      setAnnotations([...annotations, {
        type: currentTool,
        x: currentShape.x,
        y: currentShape.y,
        width: currentShape.width,
        height: currentShape.height,
      }]);
    }

    setIsDrawingShape(false);
    setStartPoint(null);
    setCurrentShape(null);
  };

  // Handle text input completion
  const handleTextSubmit = () => {
    if (!textInput.trim() || !textPosition) {
      setIsAddingText(false);
      setTextInput('');
      setTextPosition(null);
      return;
    }

    setAnnotations([...annotations, {
      type: 'text',
      x: textPosition.x,
      y: textPosition.y,
      text: textInput.trim(),
    }]);

    setIsAddingText(false);
    setTextInput('');
    setTextPosition(null);
  };

  // Handle undo
  const handleUndo = () => {
    if (annotations.length > 0) {
      setAnnotations(annotations.slice(0, -1));
    }
  };

  // Update annotated screenshot when annotations change
  useEffect(() => {
    if (isAnnotating && canvasRef.current && annotations.length > 0) {
      setAnnotatedScreenshot(canvasRef.current.toDataURL('image/png'));
    } else if (annotations.length === 0) {
      setAnnotatedScreenshot(null);
    }
  }, [annotations, isAnnotating]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!description.trim()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const traceId = logger.generateTraceId();

      const payload: IssueReportRequest = {
        timestamp: new Date().toISOString(),
        traceId,
        sessionId: logger.getSessionId(),
        route: window.location.pathname,
        userAgent: navigator.userAgent,
        description: description.trim(),
        screenshot: includeScreenshot ? (annotatedScreenshot || screenshot) : null,
        screenshotError: screenshotError || undefined,
      };

      await onSubmit(payload);
      onClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit issue report';
      setSubmitError(errorMessage);
      logger.error('Failed to submit issue report', 'ReportIssueModal', error as Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        // Close modal when clicking backdrop
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <h2 id="modal-title" className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Report an Issue</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
              disabled={isSubmitting}
              aria-label="Close modal"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Body - Scrollable */}
          <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Describe the issue you encountered. We'll automatically capture a screenshot and relevant context.
            </p>

            {/* Submit Error */}
            {submitError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                <p className="text-sm text-red-800 dark:text-red-200">{submitError}</p>
              </div>
            )}

            {/* Description (Required) */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                What went wrong? *
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell us what you were trying to do and what happened."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 min-h-[120px] resize-y bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                required
                disabled={isSubmitting}
                minLength={10}
                maxLength={4000}
              />
            </div>

            {/* Screenshot Section */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Screenshot</label>
                {isCapturing && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">Capturing...</span>
                )}
              </div>

              {screenshotError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <p className="text-sm text-red-800 dark:text-red-200">{screenshotError}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    The report will still be submitted without a screenshot.
                  </p>
                </div>
              )}

              {screenshot && !screenshotError && (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="include-screenshot"
                      checked={includeScreenshot}
                      onChange={(e) => setIncludeScreenshot(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 dark:focus:ring-blue-400"
                    />
                    <label htmlFor="include-screenshot" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      Include screenshot with bug report
                    </label>
                  </div>

                  {includeScreenshot && (
                    <>
                      {!isAnnotating ? (
                        <div className="space-y-2">
                          <img
                            src={annotatedScreenshot || screenshot}
                            alt="Screenshot preview"
                            className="w-full border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800"
                            style={{ maxHeight: '300px', objectFit: 'contain' }}
                          />
                          <button
                            type="button"
                            onClick={() => setIsAnnotating(true)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                          >
                            <Pen className="w-4 h-4" />
                            {annotatedScreenshot ? 'Edit Annotations' : 'Add Annotations'}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Tool Selector */}
                          <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mr-1">Tools:</span>
                            <button
                              type="button"
                              onClick={() => setCurrentTool('rectangle')}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
                                currentTool === 'rectangle'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                              }`}
                              title="Draw rectangle"
                            >
                              <Square className="w-3.5 h-3.5" />
                              Rectangle
                            </button>
                            <button
                              type="button"
                              onClick={() => setCurrentTool('circle')}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
                                currentTool === 'circle'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                              }`}
                              title="Draw circle/oval"
                            >
                              <Circle className="w-3.5 h-3.5" />
                              Circle
                            </button>
                            <button
                              type="button"
                              onClick={() => setCurrentTool('text')}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
                                currentTool === 'text'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                              }`}
                              title="Add text"
                            >
                              <Type className="w-3.5 h-3.5" />
                              Text
                            </button>
                            <div className="flex-1" />
                            <button
                              type="button"
                              onClick={handleUndo}
                              disabled={annotations.length === 0}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Undo last annotation"
                            >
                              <Undo className="w-3.5 h-3.5" />
                              Undo
                            </button>
                          </div>

                          {/* Canvas */}
                          <div className="relative border border-gray-200 dark:border-gray-700 rounded-md overflow-auto max-h-[600px] bg-gray-50 dark:bg-gray-800">
                            <canvas
                              ref={canvasRef}
                              onMouseDown={handleMouseDown}
                              onMouseMove={handleMouseMove}
                              onMouseUp={handleMouseUp}
                              onMouseLeave={handleMouseUp}
                              className={currentTool === 'text' ? 'cursor-text' : 'cursor-crosshair'}
                              style={{ display: 'block', width: '100%', height: 'auto' }}
                            />

                            {/* Text Input Overlay */}
                            {isAddingText && textPosition && (
                              <div
                                className="absolute"
                                style={{
                                  left: `${(textPosition.x / (canvasRef.current?.width || 1)) * 100}%`,
                                  top: `${(textPosition.y / (canvasRef.current?.height || 1)) * 100}%`,
                                  transform: 'translate(-50%, -100%)',
                                }}
                              >
                                <input
                                  ref={textInputRef}
                                  type="text"
                                  value={textInput}
                                  onChange={(e) => setTextInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleTextSubmit();
                                    } else if (e.key === 'Escape') {
                                      setIsAddingText(false);
                                      setTextInput('');
                                      setTextPosition(null);
                                    }
                                  }}
                                  onBlur={handleTextSubmit}
                                  placeholder="Type text..."
                                  className="px-2 py-1 text-sm border-2 border-red-500 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                                  style={{ minWidth: '150px' }}
                                />
                              </div>
                            )}
                          </div>

                          {/* Instructions */}
                          <div className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                            <div className="text-xs text-blue-800 dark:text-blue-200">
                              {currentTool === 'rectangle' && (
                                <p><strong>Rectangle:</strong> Click and drag to draw a red rectangle outline</p>
                              )}
                              {currentTool === 'circle' && (
                                <p><strong>Circle:</strong> Click and drag to draw a red circle/oval outline</p>
                              )}
                              {currentTool === 'text' && (
                                <p><strong>Text:</strong> Click where you want to place text, then type and press Enter</p>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setIsAnnotating(false);
                                setAnnotations([]);
                                setAnnotatedScreenshot(null);
                              }}
                              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            >
                              Clear & Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsAnnotating(false)}
                              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 dark:bg-blue-500 border border-transparent rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                            >
                              Done Annotating
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 dark:bg-blue-500 border border-transparent rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={isSubmitting || !description.trim()}
            >
              {isSubmitting ? 'Saving...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // Render modal using a portal to ensure it's always on top
  return createPortal(modalContent, document.body);
}

export function ReportIssueButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [lastReported, setLastReported] = useState<Date | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async (payload: IssueReportRequest) => {
    setReporting(true);

    try {
      const response = await fetch('/api/issues', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: IssueReportApiResponse = await response.json();

      if (data.success) {
        setLastReported(new Date());
        setShowSuccess(true);

        logger.info('Issue reported successfully', 'ReportIssueButton', {
          issueId: data.data.issueId,
          traceId: payload.traceId,
        });

        setTimeout(() => setShowSuccess(false), 3000);
      } else {
        throw new Error('API returned success: false');
      }
    } catch (error) {
      logger.error(
        'Failed to report issue',
        'ReportIssueButton',
        error instanceof Error ? error : undefined
      );
      throw error;
    } finally {
      setReporting(false);
    }
  };

  const canReport = !lastReported || Date.now() - lastReported.getTime() > 60000;

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setIsOpen(true)}
          disabled={reporting || !canReport}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={
            !canReport
              ? 'Please wait 60 seconds between reports'
              : 'Report an issue with this page'
          }
        >
          <AlertCircle className="w-4 h-4" />
          Report Issue
        </button>

        {showSuccess && (
          <div className="absolute top-full mt-2 right-0 z-50 min-w-max">
            <div className="bg-green-50 border border-green-200 rounded-md px-3 py-2 flex items-center gap-2 shadow-lg">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-800">Issue reported! Triage started.</span>
            </div>
          </div>
        )}
      </div>

      <ReportIssueModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSubmit={handleSubmit}
      />
    </>
  );
}
