import React, { useEffect, useRef } from 'react';
import { Loader2, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { CloudLoggingStatus, LogLevel, ParsedCloudLog } from '../types/log.types';
import LogLevelBadge from './LogLevelBadge';

interface CloudLogsViewerProps {
  logs: ParsedCloudLog[];
  isLoading: boolean;
  error: string | null;
  cloudLoggingStatus: CloudLoggingStatus | null;
  searchText: string;
  selectedLevels: LogLevel[];
  showMetadata: boolean;
  onSearchChange: (text: string) => void;
  onToggleLevel: (level: LogLevel) => void;
  onSelectAllLevels: () => void;
  onClearAllLevels: () => void;
  onClearSearch: () => void;
  onRefresh: () => void;
  onClear: () => void;
}

const LOG_LEVELS: LogLevel[] = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
const DEFAULT_PROJECT_ID = 'static-sites-257923';

const levelMessageClass: Record<LogLevel, string> = {
  ERROR: 'text-destructive',
  WARN: 'text-amber-400',
  INFO: 'text-primary-foreground',
  DEBUG: 'text-muted-foreground',
};

const CloudLogsViewer: React.FC<CloudLogsViewerProps> = ({
  logs,
  isLoading,
  error,
  cloudLoggingStatus,
  searchText,
  selectedLevels,
  showMetadata,
  onSearchChange,
  onToggleLevel,
  onSelectAllLevels,
  onClearAllLevels,
  onClearSearch,
}) => {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const formatTimestamp = (timestamp: number) =>
    new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

  const getTraceUrl = (traceId: string, projectId: string = DEFAULT_PROJECT_ID) => {
    if (!traceId) return null;
    const parts = traceId.split('/');
    return `https://console.cloud.google.com/traces/list?project=${projectId}&tid=${parts[parts.length - 1]}`;
  };

  const highlightText = (text: string, highlight: string) => {
    if (!highlight) return text;
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return parts.map((part, index) =>
      part.toLowerCase() === highlight.toLowerCase() ? (
        <mark
          key={`${part}-${index}`}
          className="rounded bg-primary/30 px-1 text-primary-foreground"
        >
          {part}
        </mark>
      ) : (
        <span key={`${part}-${index}`}>{part}</span>
      ),
    );
  };

  const renderMetadata = (log: ParsedCloudLog) => {
    const resourceType =
      typeof log.metadata.resource === 'object' && log.metadata.resource
        ? String((log.metadata.resource as Record<string, unknown>).type ?? '')
        : '';

    if (
      !showMetadata ||
      (!log.metadata.trace && !log.metadata.spanId && !log.metadata.severity && !resourceType)
    ) {
      return null;
    }

    return (
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground/80">
        {log.metadata.trace && (
          <span>
            Trace:{' '}
            <a
              href={getTraceUrl(log.metadata.trace) ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              {log.metadata.trace.split('/').pop()?.substring(0, 8)}...
            </a>
          </span>
        )}
        {log.metadata.spanId && <span>Span: {log.metadata.spanId}</span>}
        {log.metadata.severity && <span>Severity: {log.metadata.severity}</span>}
        {resourceType && <span>Resource: {resourceType}</span>}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-background/40 text-xs text-muted-foreground">
      {cloudLoggingStatus && !cloudLoggingStatus.available && (
        <div className="border-b border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning-foreground">
          Cloud Logging unavailable: {cloudLoggingStatus.message}
        </div>
      )}

      {error && (
        <div className="border-b border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          Error: {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-card/80 px-3 py-2">
        <span className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Levels</span>
        {LOG_LEVELS.map((level) => {
          const active = selectedLevels.includes(level);
          return (
            <Button
              key={level}
              type="button"
              size="sm"
              variant={active ? 'secondary' : 'outline'}
              className="font-mono text-[10px] uppercase tracking-[0.3em]"
              onClick={() => onToggleLevel(level)}
            >
              {level}
            </Button>
          );
        })}
        <Button type="button" variant="ghost" size="sm" onClick={onSelectAllLevels}>
          All
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClearAllLevels}>
          None
        </Button>

        <div className="ml-auto flex min-w-[220px] flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search logs..."
              className="h-9 w-full bg-background pl-9 pr-8 text-xs"
            />
            {searchText && (
              <button
                type="button"
                onClick={onClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Badge variant="outline" className="text-[10px] uppercase tracking-[0.2em]">
            {logs.length} logs
          </Badge>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-background/20">
        {isLoading && logs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading cloud logs…
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
            <span>No cloud logs available</span>
            <span className="text-[11px] text-muted-foreground/70">
              Adjust filters or trigger a refresh
            </span>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {logs.map((log) => (
              <div key={log.id} className="px-3 py-2">
                <div className="flex items-start gap-3">
                  {showMetadata && (
                    <span className="min-w-[110px] font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70">
                      {formatTimestamp(log.timestamp)}
                    </span>
                  )}
                  <LogLevelBadge level={log.level} />
                  <span
                    className={cn(
                      'flex-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed',
                      levelMessageClass[log.level],
                      !levelMessageClass[log.level] && 'text-foreground',
                    )}
                  >
                    {searchText ? highlightText(log.message, searchText) : log.message}
                  </span>
                </div>
                {renderMetadata(log)}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
};

export default CloudLogsViewer;
