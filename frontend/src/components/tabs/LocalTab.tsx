import ServiceGrid from '../ServiceGrid';
import MinimalPanelContainer from '../MinimalPanelContainer';
import { QuickActions } from '../common';
import type { QuickAction } from '../common';

export function LocalTab() {
  // Quick actions for services
  const serviceActions: QuickAction[] = [
    {
      id: 'start-all',
      label: 'Start All',
      icon: '▶️',
      description: 'Start all services',
      variant: 'success',
      onClick: () => {
        // This would integrate with the actual service management
        console.log('Start all services');
      },
    },
    {
      id: 'stop-all',
      label: 'Stop All',
      icon: '⏹️',
      description: 'Stop all services',
      variant: 'danger',
      onClick: () => {
        console.log('Stop all services');
      },
    },
    {
      id: 'restart-all',
      label: 'Restart All',
      icon: '🔄',
      description: 'Restart all services',
      variant: 'warning',
      onClick: () => {
        console.log('Restart all services');
      },
    },
    {
      id: 'view-logs',
      label: 'View All Logs',
      icon: '📋',
      description: 'View logs for all services',
      onClick: () => {
        console.log('View all logs');
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <QuickActions
        actions={serviceActions}
        title="Service Actions"
        collapsible
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Services
          </h2>
          <span className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
            Local control plane
          </span>
        </div>
        <ServiceGrid />
      </section>

      <section className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-inner">
        <MinimalPanelContainer />
      </section>
    </div>
  );
}
