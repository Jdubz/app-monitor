import React, { useState, useRef, useEffect } from 'react';
import { DevMonitorLogLine, LocalService } from '@jsdubzw/job-finder-shared-types';

interface MinimalLogsPanelProps {
  panelId: string;
  selectedSource: LocalService | null;
  availableSources: LocalService[];
  logs: DevMonitorLogLine[];
  isLoading: boolean;
  hasError: boolean;
  errorMessage?: string;
  onSourceChange: (source: LocalService) => void;
  onRemove: () => void;
  canRemove: boolean;
}

const MinimalLogsPanel: React.FC<MinimalLogsPanelProps> = ({
  panelId: _panelId,
  selectedSource,
  availableSources,
  logs,
  isLoading,
  hasError,
  errorMessage,
  onSourceChange,
  onRemove,
  canRemove,
}) => {
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const filteredLogs = showErrorsOnly
    ? logs.filter(log => log.level === 'ERROR')
    : logs;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minWidth: '400px',
      height: '100%',
      border: '1px solid #333',
      borderRadius: '6px',
      backgroundColor: '#1a1a1a',
      overflow: 'hidden',
      flex: '1 1 400px',
    }}>
      {/* Minimal Header */}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '8px',
        borderBottom: '1px solid #333',
        backgroundColor: '#222',
        alignItems: 'center',
      }}>
        {/* Source Dropdown */}
        <select
          value={selectedSource || ''}
          onChange={(e) => onSourceChange(e.target.value as LocalService)}
          style={{
            flex: 1,
            padding: '4px 8px',
            backgroundColor: '#2a2a2a',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: '4px',
            fontSize: '12px',
            outline: 'none',
            cursor: 'pointer',
          }}
          disabled={isLoading || availableSources.length === 0}
        >
          <option value="" disabled>Select source...</option>
          {availableSources.map(source => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>

        {/* Error Filter */}
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11px',
          color: '#999',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}>
          <input
            type="checkbox"
            checked={showErrorsOnly}
            onChange={(e) => setShowErrorsOnly(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Errors Only
        </label>

        {/* Remove Button */}
        {canRemove && (
          <button
            onClick={onRemove}
            style={{
              padding: '4px 8px',
              backgroundColor: '#dc3545',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            title="Remove panel"
          >
            ×
          </button>
        )}
      </div>

      {/* Logs Container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          fontFamily: 'monospace',
          fontSize: '12px',
          lineHeight: '1.4',
        }}
      >
        {/* Loading State */}
        {isLoading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#666',
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            }}>
              <div style={{
                width: '24px',
                height: '24px',
                border: '3px solid #333',
                borderTop: '3px solid #007bff',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              <div>Loading logs...</div>
            </div>
          </div>
        )}

        {/* Error State */}
        {!isLoading && hasError && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: '20px',
            textAlign: 'center',
          }}>
            <div style={{
              padding: '16px',
              backgroundColor: '#dc3545',
              color: '#fff',
              borderRadius: '6px',
              fontSize: '13px',
            }}>
              <div style={{ fontWeight: 600, marginBottom: '8px' }}>
                ⚠️ Error
              </div>
              <div>{errorMessage || 'Invalid source. Please select a new source.'}</div>
            </div>
          </div>
        )}

        {/* Logs Display */}
        {!isLoading && !hasError && (
          <>
            {filteredLogs.length === 0 ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#666',
              }}>
                {selectedSource ? 'No logs available' : 'Select a source to view logs'}
              </div>
            ) : (
              <>
                {filteredLogs.map(log => {
                  const date = new Date(log.timestamp);
                  const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`;

                  let color = '#ccc';
                  if (log.level === 'ERROR') color = '#dc3545';
                  else if (log.level === 'WARN') color = '#ffc107';
                  else if (log.level === 'DEBUG') color = '#6c757d';

                  return (
                    <div
                      key={log.id}
                      style={{
                        padding: '2px 8px',
                        borderBottom: '1px solid #222',
                        color,
                        wordBreak: 'break-word',
                      }}
                    >
                      <span style={{ color: '#666', marginRight: '8px' }}>{timeStr}</span>
                      <span style={{ color: '#888', marginRight: '8px' }}>[{log.level}]</span>
                      {log.message}
                    </div>
                  );
                })}
                <div ref={logsEndRef} />
              </>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default MinimalLogsPanel;
