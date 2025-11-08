import { useState } from 'react';
import { ProcessInfo } from '../types/service.types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

  const buildClass = (
    disabled: boolean,
    baseClass: string,
  ) =>
    cn(
      'h-9 min-w-[72px] justify-center rounded-md text-xs font-semibold uppercase tracking-[0.3em]',
      baseClass,
      disabled && 'opacity-50 pointer-events-none',
    );

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={() => handleAction(onStart, 'start')}
        disabled={isRunning || isTransitional || loading !== null}
        className={buildClass(
          isRunning || isTransitional || loading !== null,
          'bg-emerald-500/80 text-emerald-950 hover:bg-emerald-500',
        )}
        title="Start the service"
      >
        {loading === 'start' ? '...' : 'Start'}
      </Button>

      <Button
        onClick={() => handleAction(onStop, 'stop')}
        disabled={isStopped || isTransitional || loading !== null}
        className={buildClass(
          isStopped || isTransitional || loading !== null,
          'bg-rose-500/80 text-rose-50 hover:bg-rose-500',
        )}
        title="Gracefully stop the service (SIGTERM)"
      >
        {loading === 'stop' ? '...' : 'Stop'}
      </Button>

      <Button
        onClick={() => handleAction(onRestart, 'restart')}
        disabled={isStopped || isTransitional || loading !== null}
        className={buildClass(
          isStopped || isTransitional || loading !== null,
          'bg-primary text-primary-foreground hover:bg-primary/90',
        )}
        title="Restart the service"
      >
        {loading === 'restart' ? '...' : 'Restart'}
      </Button>

      <Button
        onClick={handleKillClick}
        disabled={isStopped || isTransitional || loading !== null}
        className={buildClass(
          isStopped || isTransitional || loading !== null,
          showKillConfirm
            ? 'bg-rose-500/80 text-rose-50 hover:bg-rose-500'
            : 'bg-slate-600 text-slate-50 hover:bg-slate-500',
        )}
        title={showKillConfirm ? 'Click again to confirm force kill (SIGKILL)' : 'Force kill the service (SIGKILL)'}
      >
        {loading === 'kill' ? '...' : showKillConfirm ? 'Confirm?' : 'Kill'}
      </Button>
    </div>
  );
};

export default ControlButtons;
