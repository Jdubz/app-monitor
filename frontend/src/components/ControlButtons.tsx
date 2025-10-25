import React, { useState } from 'react';
import { ProcessInfo } from '../types/service.types';

interface ControlButtonsProps {
  service: ProcessInfo;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onRestart: () => Promise<void>;
  onKill: () => Promise<void>;
}

const ControlButtons: React.FC<ControlButtonsProps> = ({
  service,
  onStart,
  onStop,
  onRestart,
  onKill,
}) => {
  const [loading, setLoading] = useState<string | null>(null);
  const [showKillConfirm, setShowKillConfirm] = useState(false);

  const isRunning = service.status === 'running';
  const isStopped = service.status === 'stopped';
  const isTransitional = service.status === 'starting' || service.status === 'stopping';

  const handleAction = async (action: () => Promise<void>, actionName: string) => {
    try {
      setLoading(actionName);
      await action();
    } catch (error) {
      console.error(`Failed to ${actionName}:`, error);
      alert(`Failed to ${actionName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(null);
    }
  };

  const handleKillClick = () => {
    if (!showKillConfirm) {
      setShowKillConfirm(true);
      setTimeout(() => setShowKillConfirm(false), 3000);
    } else {
      handleAction(onKill, 'kill');
      setShowKillConfirm(false);
    }
  };

  const buttonStyle = (disabled: boolean, color: string) => ({
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '4px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    backgroundColor: disabled ? '#e9ecef' : color,
    color: disabled ? '#6c757d' : '#fff',
    transition: 'all 0.2s',
    minWidth: '70px',
  });

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <button
        onClick={() => handleAction(onStart, 'start')}
        disabled={isRunning || isTransitional || loading !== null}
        style={buttonStyle(isRunning || isTransitional || loading !== null, '#28a745')}
        title="Start the service"
      >
        {loading === 'start' ? '...' : 'Start'}
      </button>

      <button
        onClick={() => handleAction(onStop, 'stop')}
        disabled={isStopped || isTransitional || loading !== null}
        style={buttonStyle(isStopped || isTransitional || loading !== null, '#dc3545')}
        title="Gracefully stop the service (SIGTERM)"
      >
        {loading === 'stop' ? '...' : 'Stop'}
      </button>

      <button
        onClick={() => handleAction(onRestart, 'restart')}
        disabled={isStopped || isTransitional || loading !== null}
        style={buttonStyle(isStopped || isTransitional || loading !== null, '#007bff')}
        title="Restart the service"
      >
        {loading === 'restart' ? '...' : 'Restart'}
      </button>

      <button
        onClick={handleKillClick}
        disabled={isStopped || isTransitional || loading !== null}
        style={{
          ...buttonStyle(isStopped || isTransitional || loading !== null, '#6c757d'),
          backgroundColor: showKillConfirm ? '#dc3545' : (isStopped || isTransitional || loading !== null ? '#e9ecef' : '#6c757d'),
        }}
        title={showKillConfirm ? 'Click again to confirm force kill (SIGKILL)' : 'Force kill the service (SIGKILL)'}
      >
        {loading === 'kill' ? '...' : showKillConfirm ? 'Confirm?' : 'Kill'}
      </button>
    </div>
  );
};

export default ControlButtons;
