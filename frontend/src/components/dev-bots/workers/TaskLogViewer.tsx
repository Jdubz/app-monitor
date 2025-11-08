import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PauseCircle, PlayCircle, RefreshCw, Terminal } from 'lucide-react';

import { getApiBasePath } from '@/services/api';
import type { DevBotsTaskLogsResponse } from '@/types/dev-bots';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { BoundedLogBuffer } from '@/utils/boundedLogBuffer';

type LogStream = 'stdout' | 'stderr';

const MAX_LINES = 4000;

interface TaskLogViewerProps {
  taskId: string | null;
  logs: DevBotsTaskLogsResponse | null;
}

const formatBytes = (size?: number) => {
  if (size === undefined) return '0 B';
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

export function TaskLogViewer({ taskId, logs }: TaskLogViewerProps) {
  const [activeStream, setActiveStream] = useState<LogStream>('stdout');
  const [autoScroll, setAutoScroll] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const logBufferRef = useRef(new BoundedLogBuffer<string>(MAX_LINES));
  const [bufferVersion, setBufferVersion] = useState(0);

  const resetBuffer = useCallback(() => {
    logBufferRef.current = new BoundedLogBuffer<string>(MAX_LINES);
    setBufferVersion((version) => version + 1);
  }, []);

  const appendLine = useCallback((line: string) => {
    logBufferRef.current.push(line);
    setBufferVersion((version) => version + 1);
  }, []);

  const lines = useMemo(() => logBufferRef.current.toArray(), [bufferVersion]);

  useEffect(() => {
    setActiveStream('stdout');
    resetBuffer();
    setStreamError(null);
    setIsStreaming(false);
  }, [taskId, resetBuffer]);

  useEffect(() => {
    if (!taskId) {
      eventSourceRef.current?.close();
      resetBuffer();
      setIsStreaming(false);
      return;
    }

    eventSourceRef.current?.close();
    resetBuffer();
    setStreamError(null);

    const baseUrl = getApiBasePath();
    const url = `${baseUrl}/dev-bots/tasks/${taskId}/logs/${activeStream}?follow=true`;
    const source = new EventSource(url);
    eventSourceRef.current = source;
    setIsStreaming(true);

    source.onmessage = (event) => {
      if (!event.data) return;
      appendLine(event.data);
    };

    source.addEventListener('stream-error', (event) => {
      const message = event instanceof MessageEvent ? event.data : 'Log stream error';
      setStreamError(message || 'Log stream error');
      setIsStreaming(false);
      source.close();
    });

    source.addEventListener('end', () => {
      setIsStreaming(false);
      source.close();
    });

    source.onerror = () => {
      setStreamError('Connection lost, refresh to retry.');
      setIsStreaming(false);
      source.close();
    };

    return () => {
      source.close();
    };
  }, [taskId, activeStream, refreshKey, appendLine, resetBuffer]);

  useEffect(() => {
    if (!autoScroll) {
      return;
    }
    const anchor = scrollAnchorRef.current;
    if (!anchor) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      anchor.scrollIntoView({ block: 'end', behavior: 'auto' });
    });
    return () => cancelAnimationFrame(frame);
  }, [lines, autoScroll]);

  const activeDescriptor = useMemo(() => logs?.[activeStream] ?? null, [logs, activeStream]);

  if (!taskId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-border/70 bg-muted/10 p-6 text-sm text-muted-foreground">
        <Terminal className="h-5 w-5" aria-hidden="true" />
        <div role="status" aria-live="polite">
          <p>Select a task to see worker logs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 rounded-lg border border-border/70 bg-muted/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">Worker Logs</h3>
        <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-[0.3em]">
          {taskId}
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={autoScroll ? 'default' : 'outline'}
            onClick={() => setAutoScroll((value) => !value)}
          >
            {autoScroll ? <PlayCircle className="mr-2 h-4 w-4" /> : <PauseCircle className="mr-2 h-4 w-4" />}
            {autoScroll ? 'Auto-scroll' : 'Paused'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setRefreshKey((key) => key + 1)}
            disabled={!taskId}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Restart Stream
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {(['stdout', 'stderr'] as LogStream[]).map((stream) => {
          const descriptor = logs?.[stream];
          return (
            <button
              key={stream}
              type="button"
              onClick={() => setActiveStream(stream)}
              className={cn(
                'rounded-md border px-3 py-1 font-mono uppercase tracking-[0.2em]',
                activeStream === stream
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/60 text-muted-foreground hover:text-foreground',
              )}
            >
              {stream}
              {descriptor && (
                <span className="ml-2 text-[10px] text-muted-foreground">
                  {formatBytes(descriptor.size)}
                </span>
              )}
            </button>
          );
        })}
        <span className="ml-auto flex items-center gap-2 text-[11px]">
          {isStreaming ? (
            <Badge variant="outline" className="border-emerald-500 text-emerald-500">
              streaming
            </Badge>
          ) : (
            <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
              idle
            </Badge>
          )}
          {activeDescriptor?.updatedAt && (
            <span>Updated {formatRelativeTime(activeDescriptor.updatedAt)}</span>
          )}
        </span>
      </div>

      {streamError && (
        <div className="rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {streamError}
        </div>
      )}

      {!activeDescriptor && !streamError && (
        <div className="rounded-md border border-border/60 bg-background/60 px-3 py-4 text-sm text-muted-foreground">
          Log file for <span className="font-semibold">{activeStream}</span> is not available yet.
        </div>
      )}

      <ScrollArea className="flex-1 rounded-md border border-border/50 bg-background/70">
        <div>
          <pre className="min-h-[320px] whitespace-pre-wrap break-words p-4 text-xs text-foreground">
            {lines.length === 0 ? (
              <span className="text-muted-foreground">Waiting for log events...</span>
            ) : (
              lines.join('\n')
            )}
          </pre>
          <div ref={scrollAnchorRef} aria-hidden="true" />
        </div>
      </ScrollArea>
    </div>
  );
}

const formatRelativeTime = (timestamp: string) => {
  const date = new Date(timestamp);
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff) || diff < 0) {
    return 'just now';
  }
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};
