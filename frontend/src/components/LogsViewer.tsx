import React, { useEffect, useRef, useState } from 'react';
import { DevMonitorLogLine, DevMonitorLogLevel, LocalService } from '@jsdubzw/job-finder-shared-types';
import LogLine from './LogLine';
import LogFilters from './LogFilters';
import LogsToolbar from './LogsToolbar';

interface LogsViewerProps {
  // Logs to display (already filtered by parent)
  logs: DevMonitorLogLine[];

  // Filter state (controlled by parent)
  availableServices: LocalService[];
  selectedServices: LocalService[];
  selectedLevels: DevMonitorLogLevel[];
  searchText: string;

  // Filter callbacks
  onToggleService: (service: LocalService) => void;
  onToggleLevel: (level: DevMonitorLogLevel) => void;
  onSearchChange: (text: string) => void;
  onSelectAllServices: () => void;
  onSelectAllLevels: () => void;
  onClearAllLevels: () => void;
  onClearSearch: () => void;

  // Display options
  showMetadata?: boolean; // Whether to show timestamp/service in log lines

  // State control
  isPaused: boolean;
  onTogglePause: () => void;

  // Actions
  onClear: () => void;

  // Auto-scroll
  autoScroll?: boolean;
  onToggleAutoScroll?: () => void;
}

const LogsViewer: React.FC<LogsViewerProps> = ({
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

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (internalAutoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, internalAutoScroll]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Space: Pause/Resume
      if (e.ctrlKey && e.code === 'Space') {
        onTogglePause();
        e.preventDefault();
      }
      // Ctrl+Down: Jump to bottom
      if (e.ctrlKey && e.key === 'ArrowDown') {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onTogglePause]);

  const handleToggleAutoScroll = () => {
    const newValue = !internalAutoScroll;
    setInternalAutoScroll(newValue);
    onToggleAutoScroll?.();
  };

  const downloadLogs = () => {
    const text = logs
      .map(log => {
        const date = new Date(log.timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        const ms = date.getMilliseconds().toString().padStart(3, '0');
        const timestamp = `${hours}:${minutes}:${seconds}.${ms}`;
        return `[${timestamp}] [${log.service}] [${log.level}] ${log.message}`;
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
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: '8px',
    overflow: 'hidden',
    fontFamily: 'monospace',
  };

  const logsContainerStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    backgroundColor: '#1a1a1a',
    userSelect: 'text',
  };

  const emptyStateStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#666',
    fontSize: '14px',
  };

  return (
    <div style={containerStyle}>
      <LogsToolbar
        isPaused={isPaused}
        autoScroll={internalAutoScroll}
        logCount={logs.length}
        filteredCount={logs.length}
        bufferedCount={0}
        onClear={onClear}
        onTogglePause={onTogglePause}
        onToggleAutoScroll={handleToggleAutoScroll}
        onDownload={downloadLogs}
      />

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

      <div ref={containerRef} style={logsContainerStyle}>
        {logs.length === 0 ? (
          <div style={emptyStateStyle}>
            <div>
              <div>No logs to display</div>
              <div style={{ fontSize: '12px', color: '#555', marginTop: '8px' }}>
                {isPaused ? 'Logs are paused' : 'Start a service to see logs'}
              </div>
            </div>
          </div>
        ) : (
          <>
            {logs.map(log => (
              <LogLine
                key={log.id}
                log={log}
                searchText={searchText}
                showMetadata={showMetadata}
              />
            ))}
            <div ref={logsEndRef} />
          </>
        )}
      </div>
    </div>
  );
};

export default LogsViewer;
