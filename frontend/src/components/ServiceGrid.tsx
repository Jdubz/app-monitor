import ServiceCard from './ServiceCard';
import { useServices } from '../hooks/useServices';
import { usePortStatus } from '../hooks/usePortStatus';
import { Badge } from '@/components/ui/badge';

const ServiceGrid: React.FC = () => {
  const {
    services,
    loading,
    error,
    startService,
    stopService,
    restartService,
    killService,
  } = useServices();

  const {
    portStatuses,
    killPortProcess,
  } = usePortStatus(3000);

  const serviceArray = Array.isArray(services) ? services : [];

  if (loading && serviceArray.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-6 py-10 text-sm text-muted-foreground">
        <span className="text-base font-semibold tracking-tight text-foreground">Loading services…</span>
        <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground/80">
          Connecting to dev monitor backend
        </span>
      </div>
    );
  }

  if (error && serviceArray.length === 0) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-6 py-8 text-sm text-rose-200 shadow-lg">
        <h3 className="text-lg font-semibold tracking-tight text-rose-100">Failed to Connect</h3>
        <p className="mt-2 text-rose-100/80">{error}</p>
        <p className="mt-3 text-xs uppercase tracking-[0.3em] text-rose-200/70">
          Ensure the backend server is running on port 5000
        </p>
      </div>
    );
  }

  if (serviceArray.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/60 px-6 py-10 text-center text-sm text-muted-foreground">
        No services configured.
      </div>
    );
  }

  const serviceOrder = ['firebase-emulators', 'job-finder-backend', 'frontend-dev', 'job-finder-worker'];
  const sortedServices = [...serviceArray].sort((a, b) => {
    const aIndex = serviceOrder.indexOf(a.name);
    const bIndex = serviceOrder.indexOf(b.name);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
        {sortedServices.map((service) => (
          <ServiceCard
            key={service.name}
            service={service}
            onStart={() => startService(service.name)}
            onStop={() => stopService(service.name)}
            onRestart={() => restartService(service.name)}
            onKill={() => killService(service.name)}
            portStatuses={portStatuses[service.name]}
            onKillPort={killPortProcess}
          />
        ))}
      </div>
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <Badge variant="warning" className="uppercase tracking-[0.3em]">
            Warning
          </Badge>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default ServiceGrid;
