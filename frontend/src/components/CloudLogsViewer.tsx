import React, { useRef, useEffect } from 'react';
import { ParsedCloudLog, CloudLoggingStatus } from '../types/log.types';
import LogLevelBadge from './LogLevelBadge';

interface CloudLogsViewerProps {
  logs: ParsedCloudLog[];
  isLoading: boolean;
  error: string | null;
  cloudLoggingStatus: CloudLoggingStatus | null;
  searchText: string;
  selectedLevels: string[];
  showMetadata: boolean;
  onSearchChange: (text: string) => void;
  onToggleLevel: (level: string) => void;
  onSelectAllLevels: () => void;
  onClearAllLevels: () => void;
  onClearSearch: () => void;
  onRefresh: () => void;
  onClear: () => void;
}

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
  onRefresh,
  onClear,
}) => {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const getTraceUrl = (traceId: string, projectId: string) => {
    if (!traceId) return null;
    // Extract just the trace ID from the full path (projects/PROJECT_ID/traces/TRACE_ID)
    const parts = traceId.split('/');
    const actualTraceId = parts[parts.length - 1];
    return `https://console.cloud.google.com/traces/list?project=${projectId}&tid=${actualTraceId}`;
  };

  const getResourceType = (resource: Record<string, unknown> | undefined): string | null => {
    if (!resource || !resource.type) return null;
    return String(resource.type);
  };

  const highlightText = (text: string, highlight: string) => {
    if (!highlight) return text;

    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === highlight.toLowerCase() ? (
            <span key={i} style={{ backgroundColor: '#ffeb3b', fontWeight: 600 }}>
              {part}
            </span>
          ) : (
            part
          )
        )}
      </>
    );
  };

  // Render cloud log line with metadata
  const renderCloudLogLine = (log: ParsedCloudLog) => {
    const lineStyle: React.CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      padding: '8px',
      fontSize: '13px',
      fontFamily: 'monospace',
      borderBottom: '1px solid #2a2a2a',
      lineHeight: '1.5',
    };

    const mainLineStyle: React.CSSProperties = {
      display: 'flex',
      gap: '8px',
      alignItems: 'flex-start',
    };

    const timestampStyle: React.CSSProperties = {
      color: '#888',
      minWidth: '120px',
      flexShrink: 0,
      fontSize: '12px',
    };

    const messageStyle: React.CSSProperties = {
      flex: 1,
      color: log.level === 'ERROR' ? '#ff6b6b' : log.level === 'WARN' ? '#ffa94d' : '#e0e0e0',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    };

    const metadataStyle: React.CSSProperties = {
      display: 'flex',
      gap: '12px',
      fontSize: '11px',
      color: '#666',
      paddingLeft: '128px',
      flexWrap: 'wrap',
    };

    const traceLinkStyle: React.CSSProperties = {
      color: '#4dabf7',
      textDecoration: 'none',
      cursor: 'pointer',
    };

    const resourceType = getResourceType(log.metadata.resource);

    return (
      <div key={log.id} style={lineStyle}>
        <div style={mainLineStyle}>
          {showMetadata && (
            <span style={timestampStyle}>{formatTimestamp(log.timestamp)}</span>
          )}
          <LogLevelBadge level={log.level} />
          <span style={messageStyle}>
            {searchText ? highlightText(log.message, searchText) : log.message}
          </span>
        </div>
        {showMetadata && (log.metadata.trace || log.metadata.spanId || log.metadata.severity || resourceType) && (
          <div style={metadataStyle}>
            {log.metadata.trace && (
              <span>
                Trace:{' '}
                <a
                  href={getTraceUrl(log.metadata.trace, 'static-sites-257923') || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={traceLinkStyle}
                >
                  {log.metadata.trace.split('/').pop()?.substring(0, 8)}...
                </a>
              </span>
            )}
            {log.metadata.spanId && <span>Span: {log.metadata.spanId}</span>}
            {log.metadata.severity && <span>Severity: {log.metadata.severity}</span>}
            {resourceType && <span>Resource: {resourceType}</span>}
          </div>
        )}
      </div>
    );
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#1a1a1a',
    fontFamily: 'monospace',
  };

  const toolbarStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: '#2a2a2a',
    borderBottom: '1px solid #444',
    flexWrap: 'wrap',
    alignItems: 'center',
    fontSize: '12px',
  };

  const filterButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 8px',
    backgroundColor: active ? '#4dabf7' : '#444',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  });

  const searchInputStyle: React.CSSProperties = {
    flex: 1,
    minWidth: '150px',
    padding: '4px 6px',
    backgroundColor: '#1a1a1a',
    color: '#e0e0e0',
    border: '1px solid #444',
    borderRadius: '4px',
    fontSize: '12px',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '4px 8px',
    backgroundColor: '#4dabf7',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: 600,
  };

  const logsContainerStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    backgroundColor: '#1a1a1a',
  };

  const emptyStateStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#666',
    fontSize: '14px',
    flexDirection: 'column',
    gap: '12px',
  };

  const warningStyle: React.CSSProperties = {
    padding: '8px 12px',
    backgroundColor: '#fff3cd',
    color: '#856404',
    borderBottom: '1px solid #ffc107',
    fontSize: '12px',
  };

  const errorStyle: React.CSSProperties = {
    padding: '8px 12px',
    backgroundColor: '#f8d7da',
    color: '#721c24',
    borderBottom: '1px solid #f5c6cb',
    fontSize: '12px',
  };

  return (
    <div style={containerStyle}>
      {/* Warning if cloud logging not available */}
      {cloudLoggingStatus && !cloudLoggingStatus.available && (
        <div style={warningStyle}>
          Cloud Logging is not available: {cloudLoggingStatus.message}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={errorStyle}>
          Error: {error}
        </div>
      )}

      {/* Toolbar */}
      <div style={toolbarStyle}>
        <span style={{ color: '#888' }}>Filter by level:</span>
        <button onClick={() => onToggleLevel('ERROR')} style={filterButtonStyle(selectedLevels.includes('ERROR'))}>
          ERROR
        </button>
        <button onClick={() => onToggleLevel('WARN')} style={filterButtonStyle(selectedLevels.includes('WARN'))}>
          WARN
        </button>
        <button onClick={() => onToggleLevel('INFO')} style={filterButtonStyle(selectedLevels.includes('INFO'))}>
          INFO
        </button>
        <button onClick={() => onToggleLevel('DEBUG')} style={filterButtonStyle(selectedLevels.includes('DEBUG'))}>
          DEBUG
        </button>
        <button onClick={onSelectAllLevels} style={{ ...buttonStyle, backgroundColor: '#868e96' }}>
          All
        </button>
        <button onClick={onClearAllLevels} style={{ ...buttonStyle, backgroundColor: '#868e96' }}>
          None
        </button>

        <span style={{ color: '#888', marginLeft: '16px' }}>Search:</span>
        <input
          type="text"
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search logs..."
          style={searchInputStyle}
        />
        {searchText && (
          <button onClick={onClearSearch} style={{ ...buttonStyle, backgroundColor: '#868e96' }}>
            Clear
          </button>
        )}

        <span style={{ color: '#888', marginLeft: 'auto' }}>
          {logs.length} logs
        </span>
      </div>

      {/* Logs Container */}
      <div style={logsContainerStyle}>
        {isLoading && logs.length === 0 ? (
          <div style={emptyStateStyle}>
            <div>Loading cloud logs...</div>
          </div>
        ) : logs.length === 0 ? (
          <div style={emptyStateStyle}>
            <div>No cloud logs available</div>
            <div style={{ fontSize: '12px', color: '#555' }}>
              Click Refresh to fetch logs
            </div>
          </div>
        ) : (
          <>
            {logs.map(log => renderCloudLogLine(log))}
            <div ref={logsEndRef} />
          </>
        )}
      </div>
    </div>
  );
};

export default CloudLogsViewer;
