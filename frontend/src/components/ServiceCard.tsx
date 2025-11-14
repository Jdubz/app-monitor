import { useState } from 'react';
import { ProcessInfo } from '../types/service.types';
import StatusBadge from './StatusBadge';
import ControlButtons from './ControlButtons';
import ServiceInfo from './ServiceInfo';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PortInfo } from '@/types/contracts';

import { getApiBaseUrl } from '@/utils/apiBaseUrl';

interface ServiceCardProps {
  service: ProcessInfo;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onRestart: () => Promise<void>;
  onKill: () => Promise<void>;
  portStatuses?: PortInfo[];
  onKillPort?: (port: number) => Promise<void>;
}

const serviceContainerVariant = (status: string) => {
  switch (status) {
    case 'running':
      return 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/40';
    case 'stopped':
      return 'bg-rose-500/15 text-rose-200 border border-rose-500/40';
    case 'starting':
    case 'restarting':
    case 'stopping':
      return 'bg-amber-500/15 text-amber-200 border border-amber-500/40 animate-pulse';
    case 'error':
      return 'bg-rose-600/20 text-rose-100 border border-rose-500/40';
    default:
      return 'bg-slate-600/20 text-slate-200 border border-slate-600/40';
  }
};

const ServiceCard: React.FC<ServiceCardProps> = ({
  service,
  onStart,
  onStop,
  onRestart,
  onKill,
  portStatuses,
  onKillPort,
}) => {
  const [isControlling, setIsControlling] = useState(false);

  const handleDockerAction = async (action: string) => {
    try {
      setIsControlling(true);
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(
        `${apiBaseUrl}/api/services/${service.name}/docker/${action}`,
        { method: 'POST' },
      );

      if (!response.ok) {
        let errorMessage = 'Docker action failed';
        try {
          const error = await response.json();
          errorMessage = error.error || error.message || errorMessage;
        } catch (jsonError) {
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      try {
        await response.json();
      } catch {
        // Response might be empty.
      }

      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error(`Docker action ${action} failed:`, error);
      alert(`Failed to ${action}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsControlling(false);
    }
  };

  return (
    <Card className="border border-border/60 bg-card/70 text-foreground shadow-xl backdrop-blur">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base sm:text-lg md:text-xl font-semibold tracking-tight">
            {service.displayName}
          </CardTitle>
          <CardDescription className="text-[10px] sm:text-xs uppercase tracking-[0.3em] text-muted-foreground">
            {service.name}
          </CardDescription>
        </div>
        <StatusBadge status={service.status} />
      </CardHeader>

      <CardContent className="space-y-5">
        {service.name === 'job-finder-worker' && service.dockerContainer && (
          <div className="rounded-xl border border-border/50 bg-background/50 p-3 sm:p-4 md:p-5">
            <div className="flex flex-col gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="min-w-[70px] sm:min-w-[88px] text-[10px] sm:text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  Container
                </span>
                <Badge className={cn('text-[10px] sm:text-xs font-semibold uppercase tracking-[0.3em]', serviceContainerVariant(service.dockerContainer.status))}>
                  {service.dockerContainer.status}
                </Badge>
                <span className="font-mono text-[10px] sm:text-xs text-muted-foreground/80 break-all">
                  {service.dockerContainer.name}
                </span>
              </div>

              {service.dockerContainer.workerStatus && (
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="min-w-[70px] sm:min-w-[88px] text-[10px] sm:text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                    Worker
                  </span>
                  <Badge className={cn('text-[10px] sm:text-xs font-semibold uppercase tracking-[0.3em]', serviceContainerVariant(service.dockerContainer.workerStatus))}>
                    {service.dockerContainer.workerStatus}
                  </Badge>
                </div>
              )}
            </div>

            <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row sm:flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDockerAction('start-container')}
                disabled={service.dockerContainer.status === 'running' || isControlling}
                className="w-full sm:w-auto text-xs sm:text-sm border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
              >
                Start Container
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDockerAction('stop-container')}
                disabled={service.dockerContainer.status !== 'running' || isControlling}
                className="w-full sm:w-auto text-xs sm:text-sm border-rose-500/40 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25"
              >
                Stop Container
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDockerAction('restart-worker')}
                disabled={service.dockerContainer.status !== 'running' || isControlling}
                className="w-full sm:w-auto text-xs sm:text-sm border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
              >
                Restart Worker
              </Button>
            </div>
          </div>
        )}

        {service.name !== 'job-finder-worker' && (
          <ControlButtons
            service={service}
            onStart={onStart}
            onStop={onStop}
            onRestart={onRestart}
            onKill={onKill}
          />
        )}

        <ServiceInfo
          service={service}
          portStatuses={portStatuses}
          onKillPort={onKillPort}
        />
      </CardContent>
    </Card>
  );
};

export default ServiceCard;
