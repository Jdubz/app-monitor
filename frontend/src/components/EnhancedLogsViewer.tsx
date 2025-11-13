import React, { useEffect, useRef, useState, useCallback, Fragment } from 'react';
import { DevMonitorLogLine, DevMonitorLogLevel, LocalService } from '../types/shared.types';
import LogLine from './LogLine';
import LogFilters from './LogFilters';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface EnhancedLogsViewerProps {
  logs: DevMonitorLogLine[];
  availableServices: LocalService[];
  selectedServices: LocalService[];
  selectedLevels: DevMonitorLogLevel[];
  searchText: string;
  onToggleService: (service: LocalService) => void;
  onToggleLevel: (level: DevMonitorLogLevel) => void;
  onSearchChange: (text: string) => void;
  onSelectAllServices: () => void;
  onSelectAllLevels: () => void;
  onClearAllLevels: () => void;
  onClearSearch: () => void;
  showMetadata?: boolean;
  isPaused: boolean;
  onTogglePause: () => void;
  onClear: () => void;
  autoScroll?: boolean;
  onToggleAutoScroll?: () => void;
}

export const EnhancedLogsViewer: React.FC<EnhancedLogsViewerProps> = ({
  logs,
  availableServices,
  selectedServices,
  selectedLevels,
  searchText,
  onToggleService,
  onToggleLevel,
  onSearchChange,
  onSelectAllServices,
  onSelectAllLevels,
  onClearAllLevels,
  onClearSearch,
  showMetadata = false,
  isPaused,
  onTogglePause,
  onClear,
  autoScroll = true,
  onToggleAutoScroll,
}) => {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [internalAutoScroll, setInternalAutoScroll] = useState(autoScroll);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (internalAutoScroll && logsEndRef.current && !isPaused) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, internalAutoScroll, isPaused]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input field
      const activeElement = document.activeElement;
      const isTyping = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';

      // Ctrl/Cmd + K: Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
        searchInput?.focus();
        e.preventDefault();
      }

      // Ctrl/Cmd + Space: Pause/Resume
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        onTogglePause();
        e.preventDefault();
      }

      // Ctrl/Cmd + Down: Jump to bottom
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowDown') {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        e.preventDefault();
      }

      // Ctrl/Cmd + Up: Jump to top
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp') {
        viewportRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        e.preventDefault();
      }

      // Ctrl/Cmd + L: Clear logs
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        onClear();
        e.preventDefault();
      }

      // Ctrl/Cmd + S: Download logs
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        downloadLogs();
        e.preventDefault();
      }

      // Ctrl/Cmd + A: Select all levels
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !e.shiftKey && !isTyping) {
        onSelectAllLevels();
        e.preventDefault();
      }

      // Ctrl/Cmd + Shift + A: Clear all levels
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        onClearAllLevels();
        e.preventDefault();
      }

      // Ctrl/Cmd + Shift + S: Select all services
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        onSelectAllServices();
        e.preventDefault();
      }

      // Escape: Clear search
      if (e.key === 'Escape' && searchText) {
        onClearSearch();
        e.preventDefault();
      }

      // Single key shortcuts (only when not typing in input)
      if (!isTyping && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // E: Toggle ERROR level
        if (e.key === 'e' || e.key === 'E') {
          onToggleLevel('ERROR');
          e.preventDefault();
        }

        // W: Toggle WARN level
        if (e.key === 'w' || e.key === 'W') {
          onToggleLevel('WARN');
          e.preventDefault();
        }

        // I: Toggle INFO level
        if (e.key === 'i' || e.key === 'I') {
          onToggleLevel('INFO');
          e.preventDefault();
        }

        // D: Toggle DEBUG level
        if (e.key === 'd' || e.key === 'D') {
          onToggleLevel('DEBUG');
          e.preventDefault();
        }

        // N: Toggle line numbers
        if (e.key === 'n' || e.key === 'N') {
          setShowLineNumbers(prev => !prev);
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onTogglePause, searchText, onClearSearch, onClear, onToggleLevel, onSelectAllLevels, onClearAllLevels, onSelectAllServices]);

  const handleToggleAutoScroll = useCallback(() => {
    const newValue = !internalAutoScroll;
    setInternalAutoScroll(newValue);
    onToggleAutoScroll?.();
  }, [internalAutoScroll, onToggleAutoScroll]);

  const downloadLogs = useCallback(() => {
    const text = logs
      .map((log, index) => {
        const date = new Date(log.timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        const ms = date.getMilliseconds().toString().padStart(3, '0');
        const timestamp = `${hours}:${minutes}:${seconds}.${ms}`;
        const lineNumber = showLineNumbers ? `${(index + 1).toString().padStart(4, ' ')} ` : '';
        return `${lineNumber}[${timestamp}] [${log.service}] [${log.level}] ${log.message}`;
      })
      .join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `app-monitor-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [logs, showLineNumbers]);

  const copyAllLogs = useCallback(() => {
    const text = logs
      .map(log => {
        const date = new Date(log.timestamp);
        const timestamp = date.toISOString();
        return `[${timestamp}] [${log.service}] [${log.level}] ${log.message}`;
      })
      .join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2000);
    });
  }, [logs]);

  const copySelectedLog = useCallback((log: DevMonitorLogLine) => {
    const date = new Date(log.timestamp);
    const timestamp = date.toISOString();
    const text = `[${timestamp}] [${log.service}] [${log.level}] ${log.message}`;
    
    navigator.clipboard.writeText(text).then(() => {
      setSelectedLine(log.id);
      setTimeout(() => setSelectedLine(null), 1000);
    });
  }, []);

  const jumpToTop = useCallback(() => {
    viewportRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const jumpToBottom = useCallback(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/50 bg-black/80 font-mono text-[13px] shadow-inner">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 bg-black/50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={isPaused ? 'default' : 'outline'}
            size="sm"
            onClick={onTogglePause}
            title={`${isPaused ? 'Resume' : 'Pause'} (Ctrl+Space)`}
            className={cn('gap-2', isPaused && 'shadow-glow')}
          >
            {isPaused ? '▶ Resume' : '⏸ Pause'}
          </Button>

          <Button
            variant={internalAutoScroll ? 'default' : 'outline'}
            size="sm"
            onClick={handleToggleAutoScroll}
            title="Toggle auto-scroll to bottom"
            className="gap-2"
          >
            {internalAutoScroll ? '↓ Auto-scroll: ON' : '↓ Auto-scroll: OFF'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLineNumbers(!showLineNumbers)}
            title="Toggle line numbers (N)"
            className="gap-2"
          >
            {showLineNumbers ? '# Lines: ON' : '# Lines: OFF'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onClear}
            title="Clear all logs (Ctrl+L)"
            className="gap-2"
          >
            🗑 Clear
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={copyAllLogs}
            title="Copy all logs to clipboard"
            className="gap-2"
          >
            📋 Copy
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={downloadLogs}
            title="Download logs (Ctrl+S)"
            className="gap-2"
          >
            ⬇ Download
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Badge variant="outline" className="border-border/60 bg-background/40 px-3 py-1 font-semibold uppercase tracking-[0.25em] text-[10px] text-muted-foreground">
            {logs.length.toLocaleString()} logs
          </Badge>
          {isPaused && (
            <Badge variant="warning" className="bg-amber-500/20 text-amber-100">
              Paused
            </Badge>
          )}
          {copiedNotification && (
            <Badge variant="success" className="bg-emerald-500/20 text-emerald-100">
              Copied!
            </Badge>
          )}
        </div>
      </div>

      {/* Filters */}
      <LogFilters
        availableServices={availableServices}
        selectedServices={selectedServices}
        selectedLevels={selectedLevels}
        searchText={searchText}
        onToggleService={onToggleService}
        onToggleLevel={onToggleLevel}
        onSearchChange={onSearchChange}
        onSelectAllServices={onSelectAllServices}
        onSelectAllLevels={onSelectAllLevels}
        onClearAllLevels={onClearAllLevels}
        onClearSearch={onClearSearch}
      />

      {/* Keyboard shortcuts help */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border/50 bg-black/40 px-4 py-2 text-[11px] text-muted-foreground">
        <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-primary">Shortcuts</span>
        {[
          ['Ctrl+K', 'Search'],
          ['Ctrl+Space', 'Pause'],
          ['E/W/I/D', 'Filters'],
          ['Ctrl+A', 'All Levels'],
          ['Ctrl+L', 'Clear'],
          ['N', 'Line#'],
        ].map(([key, label]) => (
          <span key={key} className="flex items-center gap-2">
            <kbd className="rounded bg-muted/40 px-2 py-1 font-sans text-[10px] font-medium text-muted-foreground">
              {key}
            </kbd>
            <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/80">{label}</span>
          </span>
        ))}
      </div>

      {/* Logs container */}
      <ScrollArea viewportRef={viewportRef} className="flex-1 bg-black/70">
        {logs.length === 0 ? (
          <div className="flex h-[320px] flex-col items-center justify-center gap-3 px-8 text-center text-muted-foreground">
            <div className="text-4xl opacity-70">📋</div>
            <div className="text-sm font-semibold uppercase tracking-[0.45em] text-muted-foreground/80">
              No logs to display
            </div>
            <div className="max-w-sm text-xs text-muted-foreground/70">
              {isPaused ? 'Logs are paused — resume the stream to receive new entries.' : 'Start a service or open a stream to inspect live telemetry.'}
            </div>
          </div>
        ) : (
          <div className="relative">
            {logs.map((log, index) => (
              <Fragment key={log.id}>
                <div
                  className={cn(
                    'group relative flex cursor-pointer select-text border-b border-white/5 transition-colors hover:bg-primary/10',
                    selectedLine === log.id && 'bg-primary/15 ring-1 ring-primary/40',
                  )}
                  onClick={() => copySelectedLog(log)}
                  title="Click to copy"
                >
                  {showLineNumbers && (
                    <span className="flex w-14 flex-shrink-0 items-start justify-end border-r border-white/5 bg-black/60 px-3 py-2 text-[11px] text-muted-foreground/70">
                      {(index + 1).toString().padStart(4, '0')}
                    </span>
                  )}
                  <div className="flex-1 px-4 py-2">
                    <LogLine
                      log={log}
                      searchText={searchText}
                      showMetadata={showMetadata}
                    />
                  </div>
                </div>
              </Fragment>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Jump buttons */}
      {logs.length > 10 && (
        <div className="pointer-events-none absolute bottom-6 right-6 flex flex-col gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={jumpToTop}
            title="Jump to top (Ctrl+ArrowUp)"
            className="pointer-events-auto bg-primary/80 text-primary-foreground shadow-lg hover:bg-primary"
          >
            ↑ Top
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={jumpToBottom}
            title="Jump to bottom (Ctrl+ArrowDown)"
            className="pointer-events-auto bg-primary/80 text-primary-foreground shadow-lg hover:bg-primary"
          >
            ↓ Bottom
          </Button>
        </div>
      )}
    </div>
  );
};

export default EnhancedLogsViewer;
