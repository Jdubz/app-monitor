import { ProcessInfo } from '../types/service.types';
import PortBadge from './PortBadge';
import { cn } from '@/lib/utils';
import type { PortInfo } from '@app-monitor/api-contracts';

interface ServiceInfoProps {
  service: ProcessInfo;
  portStatuses?: PortInfo[];
  onKillPort?: (port: number) => Promise<void>;
}

const ServiceInfo: React.FC<ServiceInfoProps> = ({ service, portStatuses, onKillPort }) => {
  const formatUptime = (ms: number | undefined) => {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const renderPorts = () => {
    if (!service.ports || service.ports.length === 0) {
      return <span className="font-mono text-xs text-muted-foreground">N/A</span>;
    }

    if (portStatuses && portStatuses.length > 0 && onKillPort) {
      return (
        <div className="flex flex-wrap gap-2">
          {portStatuses.map((portInfo) => (
            <PortBadge
              key={portInfo.port}
              portInfo={portInfo}
              onKillPort={onKillPort}
            />
          ))}
        </div>
      );
    }

    return (
      <span className="font-mono text-xs text-muted-foreground">
        {service.ports.join(', ')}
      </span>
    );
  };

  const InfoRow = ({
    label,
    value,
  }: {
    label: string;
    value: React.ReactNode;
  }) => (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-2 text-xs">
      <span className="font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        {label}
      </span>
      <div className="text-right text-sm text-foreground">{value}</div>
    </div>
  );

  return (
    <div className="rounded-xl border border-border/60 bg-background/50 p-4 text-foreground">
      <InfoRow label="Status" value={<span className="font-mono text-xs text-muted-foreground">{service.status}</span>} />

      {service.status === 'running' && (
        <>
          <InfoRow
            label="PID"
            value={<span className="font-mono text-xs text-muted-foreground">{service.pid || 'N/A'}</span>}
          />
          <InfoRow
            label="Uptime"
            value={<span className="font-mono text-xs text-muted-foreground">{formatUptime(service.uptime)}</span>}
          />
        </>
      )}

      <div className={cn('flex flex-col gap-2 py-2')}>
        <span className="font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Ports
        </span>
        {renderPorts()}
      </div>

      {service.error && (
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive-foreground">
          <strong className="font-semibold uppercase tracking-[0.3em]">Error:</strong>{' '}
          <span className="font-mono">{service.error}</span>
        </div>
      )}
    </div>
  );
};

export default ServiceInfo;
