import React, { useEffect, useRef, useState, useCallback } from 'react';
import { DevMonitorLogLine, DevMonitorLogLevel, LocalService } from '@jsdubzw/job-finder-shared-types';
import LogLine from './LogLine';
import LogFilters from './LogFilters';
import styles from './EnhancedLogsViewer.module.css';
import { StyledButton } from './common';

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
  const containerRef = useRef<HTMLDivElement>(null);
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
        containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
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

      // Escape: Clear search
      if (e.key === 'Escape' && searchText) {
        onClearSearch();
        e.preventDefault();
      }

      // N: Toggle line numbers
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const activeElement = document.activeElement;
        if (activeElement?.tagName !== 'INPUT' && activeElement?.tagName !== 'TEXTAREA') {
          setShowLineNumbers(prev => !prev);
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onTogglePause, searchText, onClearSearch, onClear]);

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
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const jumpToBottom = useCallback(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div className={styles.container}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.buttonGroup}>
          <StyledButton
            variant={isPaused ? 'primary' : 'secondary'}
            size="sm"
            onClick={onTogglePause}
            title={`${isPaused ? 'Resume' : 'Pause'} (Ctrl+Space)`}
          >
            {isPaused ? '▶ Resume' : '⏸ Pause'}
          </StyledButton>

          <StyledButton
            variant={internalAutoScroll ? 'primary' : 'secondary'}
            size="sm"
            onClick={handleToggleAutoScroll}
            title="Toggle auto-scroll to bottom"
          >
            {internalAutoScroll ? '↓ Auto-scroll: ON' : '↓ Auto-scroll: OFF'}
          </StyledButton>

          <StyledButton
            variant="secondary"
            size="sm"
            onClick={() => setShowLineNumbers(!showLineNumbers)}
            title="Toggle line numbers (N)"
          >
            {showLineNumbers ? '# Lines: ON' : '# Lines: OFF'}
          </StyledButton>

          <StyledButton
            variant="secondary"
            size="sm"
            onClick={onClear}
            title="Clear all logs (Ctrl+L)"
          >
            🗑 Clear
          </StyledButton>

          <StyledButton
            variant="secondary"
            size="sm"
            onClick={copyAllLogs}
            title="Copy all logs to clipboard"
          >
            📋 Copy
          </StyledButton>

          <StyledButton
            variant="secondary"
            size="sm"
            onClick={downloadLogs}
            title="Download logs (Ctrl+S)"
          >
            ⬇ Download
          </StyledButton>
        </div>

        <div className={styles.stats}>
          <span className={styles.statItem}>
            {logs.length.toLocaleString()} logs
          </span>
          {isPaused && <span className={styles.pausedIndicator}>PAUSED</span>}
          {copiedNotification && <span className={styles.copiedIndicator}>✓ Copied!</span>}
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
      <div className={styles.shortcutsHint}>
        <span>Shortcuts:</span>
        <span>Ctrl+K=Search</span>
        <span>Ctrl+Space=Pause</span>
        <span>Ctrl+L=Clear</span>
        <span>Ctrl+S=Download</span>
        <span>N=Line#</span>
      </div>

      {/* Logs container */}
      <div ref={containerRef} className={styles.logsContainer}>
        {logs.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📋</div>
            <div className={styles.emptyText}>No logs to display</div>
            <div className={styles.emptyHint}>
              {isPaused ? 'Logs are paused - Resume to see new logs' : 'Start a service to see logs'}
            </div>
          </div>
        ) : (
          <div className={showLineNumbers ? styles.logsWithNumbers : styles.logs}>
            {logs.map((log, index) => (
              <div 
                key={log.id} 
                className={`${styles.logRow} ${selectedLine === log.id ? styles.selected : ''}`}
                onClick={() => copySelectedLog(log)}
                title="Click to copy"
              >
                {showLineNumbers && (
                  <span className={styles.lineNumber}>{index + 1}</span>
                )}
                <div className={styles.logContent}>
                  <LogLine
                    log={log}
                    searchText={searchText}
                    showMetadata={showMetadata}
                  />
                </div>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Jump buttons */}
      {logs.length > 10 && (
        <div className={styles.jumpButtons}>
          <button 
            className={styles.jumpButton}
            onClick={jumpToTop}
            title="Jump to top (Ctrl+ArrowUp)"
          >
            ↑ Top
          </button>
          <button 
            className={styles.jumpButton}
            onClick={jumpToBottom}
            title="Jump to bottom (Ctrl+ArrowDown)"
          >
            ↓ Bottom
          </button>
        </div>
      )}
    </div>
  );
};

export default EnhancedLogsViewer;
