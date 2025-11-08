import React from 'react';

interface LogsToolbarProps {
  isPaused: boolean;
  autoScroll: boolean;
  logCount: number;
  filteredCount: number;
  bufferedCount: number;
  onClear: () => void;
  onTogglePause: () => void;
  onToggleAutoScroll: () => void;
  onDownload: () => void;
}

const LogsToolbar: React.FC<LogsToolbarProps> = ({
  isPaused,
  autoScroll,
  logCount,
  filteredCount,
  bufferedCount,
  onClear,
  onTogglePause,
  onToggleAutoScroll,
  onDownload,
}) => {
  const toolbarStyle: React.CSSProperties = {
    padding: '10px 12px',
    backgroundColor: '#252525',
    borderBottom: '1px solid #444',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
  };

  const buttonGroupStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
  };

  const buttonStyle = (active: boolean = false): React.CSSProperties => ({
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: 500,
    border: '1px solid #555',
    borderRadius: '4px',
    backgroundColor: active ? '#007bff' : '#3a3a3a',
    color: active ? '#fff' : '#ccc',
    cursor: 'pointer',
    transition: 'all 0.2s',
  });

  const statsStyle: React.CSSProperties = {
    fontSize: '13px',
    color: '#aaa',
    fontFamily: 'monospace',
  };

  return (
    <div style={toolbarStyle}>
      <div style={buttonGroupStyle}>
        <button
          onClick={onTogglePause}
          style={buttonStyle(isPaused)}
          title={isPaused ? 'Resume streaming' : 'Pause streaming'}
          onMouseEnter={(e) => !isPaused && (e.currentTarget.style.backgroundColor = '#4a4a4a')}
          onMouseLeave={(e) => !isPaused && (e.currentTarget.style.backgroundColor = '#3a3a3a')}
        >
          {isPaused ? '▶ Resume' : '⏸ Pause'}
        </button>

        <button
          onClick={onToggleAutoScroll}
          style={buttonStyle(autoScroll)}
          title="Toggle auto-scroll to bottom"
          onMouseEnter={(e) => !autoScroll && (e.currentTarget.style.backgroundColor = '#4a4a4a')}
          onMouseLeave={(e) => !autoScroll && (e.currentTarget.style.backgroundColor = '#3a3a3a')}
        >
          {autoScroll ? '↓ Auto-scroll: ON' : '↓ Auto-scroll: OFF'}
        </button>

        <button
          onClick={onClear}
          style={buttonStyle()}
          title="Clear all logs from view"
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4a4a4a'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3a3a3a'}
        >
          🗑 Clear
        </button>

        <button
          onClick={onDownload}
          style={buttonStyle()}
          title="Download logs as text file"
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4a4a4a'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3a3a3a'}
        >
          ⬇ Download
        </button>
      </div>

      <div style={statsStyle}>
        Showing {filteredCount.toLocaleString()} / {logCount.toLocaleString()} logs
        {bufferedCount > 0 && ` (${bufferedCount} buffered)`}
      </div>
    </div>
  );
};

export default LogsToolbar;
