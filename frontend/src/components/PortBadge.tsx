import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PortInfo } from '@/types/contracts';

interface PortBadgeProps {
  portInfo: PortInfo;
  onKillPort: (port: number) => Promise<void>;
}

const PortBadge: React.FC<PortBadgeProps> = ({ portInfo, onKillPort }) => {
  const [killing, setKilling] = useState(false);

  const handleKillPort = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!portInfo.inUse || killing) return;

    const confirmed = window.confirm(
      `Stop process on port ${portInfo.port}?\n\n` +
        `This will kill PID ${portInfo.pid}.\n` +
        `The service will attempt graceful shutdown first.`,
    );

    if (!confirmed) return;

    setKilling(true);
    try {
      await onKillPort(portInfo.port);
    } catch (error) {
      console.error(`Failed to kill port ${portInfo.port}:`, error);
    } finally {
      setKilling(false);
    }
  };

  const containerClass = portInfo.inUse
    ? 'border-rose-500/40 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25 cursor-pointer'
    : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100';

  return (
    <span
      className={cn(
        'group inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs font-semibold transition-transform duration-150',
        containerClass,
        portInfo.inUse && 'hover:-translate-y-0.5',
      )}
      title={
        portInfo.inUse
          ? `Port ${portInfo.port} IN USE (PID: ${portInfo.pid}) - Click to stop`
          : `Port ${portInfo.port} available`
      }
      onClick={portInfo.inUse ? handleKillPort : undefined}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          portInfo.inUse ? 'bg-rose-400' : 'bg-emerald-400',
        )}
      />
      {portInfo.port}
      {portInfo.inUse && (
        <Button
          variant="ghost"
          size="sm"
          className="ml-2 h-6 w-6 rounded-full border border-rose-500/40 bg-rose-500/20 p-0 text-[11px] font-bold text-rose-100 hover:bg-rose-500/30"
          onClick={handleKillPort}
          disabled={killing}
          title={killing ? 'Stopping...' : 'Stop process on this port'}
        >
          {killing ? '...' : '✕'}
        </Button>
      )}
    </span>
  );
};

export default PortBadge;
