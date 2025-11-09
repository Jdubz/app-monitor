import { Play, RefreshCw, ScrollText, Square } from "lucide-react";

import ServiceGrid from "../ServiceGrid";
import MinimalPanelContainer from "../MinimalPanelContainer";
import { QuickActions } from "../common";
import type { QuickAction } from "../common";

export function LocalTab() {
  const serviceActions: QuickAction[] = [
    {
      id: "start-all",
      label: "Start All",
      icon: <Play className="h-5 w-5" />,
      description: "Start every local service worker",
      variant: "success",
      disabled: true,
      disabledReason: "Local process orchestration will land once the supervisor API is exposed.",
    },
    {
      id: "stop-all",
      label: "Stop All",
      icon: <Square className="h-5 w-5" />,
      description: "Gracefully stop services",
      variant: "danger",
      disabled: true,
      disabledReason: "Local process orchestration will land once the supervisor API is exposed.",
    },
    {
      id: "restart-all",
      label: "Restart All",
      icon: <RefreshCw className="h-5 w-5" />,
      description: "Restart to apply config changes",
      variant: "warning",
      disabled: true,
      disabledReason: "Local process orchestration will land once the supervisor API is exposed.",
    },
    {
      id: "view-logs",
      label: "View All Logs",
      icon: <ScrollText className="h-5 w-5" />,
      description: "Open the combined log stream",
      disabled: true,
      disabledReason: "Log drill-down routes will be wired after the log muxer stabilizes.",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <QuickActions actions={serviceActions} title="Service Actions" collapsible />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Services</h2>
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
