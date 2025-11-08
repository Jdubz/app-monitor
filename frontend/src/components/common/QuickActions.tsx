import { ReactNode, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface QuickAction {
  id: string;
  label: string;
  icon: ReactNode;
  description?: string;
  shortcut?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "success" | "danger" | "warning";
  disabled?: boolean;
  disabledReason?: string;
}

export interface QuickActionsProps {
  actions: QuickAction[];
  title?: string;
  collapsible?: boolean;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  actions,
  title = "Quick Actions",
  collapsible = true,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const variantClasses: Record<NonNullable<QuickAction["variant"]>, string> = {
    primary:
      "border-primary/40 bg-primary/10 text-primary-foreground data-[disabled=true]:text-primary-foreground/60",
    secondary: "border-border bg-background/60 text-foreground",
    success:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-100 data-[disabled=true]:text-emerald-200/60",
    danger:
      "border-rose-500/40 bg-rose-500/15 text-rose-50 data-[disabled=true]:text-rose-100/60",
    warning:
      "border-amber-500/40 bg-amber-500/10 text-amber-100 data-[disabled=true]:text-amber-200/60",
  };

  const renderAction = (action: QuickAction) => {
    const isDisabled = action.disabled ?? !action.onClick;
    const classes = cn(
      "relative h-auto min-h-[92px] w-full flex-1 flex-col items-start gap-3 rounded-xl border border-border/60 bg-background/80 px-4 py-3 text-left shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[disabled=true]:opacity-60 data-[disabled=true]:cursor-not-allowed",
      variantClasses[action.variant ?? "secondary"],
      !isDisabled && "hover:-translate-y-1 hover:shadow-lg",
    );

    const button = (
      <Button
        key={action.id}
        type="button"
        variant="outline"
        className={classes}
        data-disabled={isDisabled}
        aria-disabled={isDisabled}
        onClick={() => {
          if (isDisabled || !action.onClick) return;
          action.onClick();
        }}
      >
        {action.shortcut && (
          <span className="absolute right-3 top-3 rounded-full bg-black/40 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
            {action.shortcut}
          </span>
        )}
        <span className="text-2xl leading-none">
          {typeof action.icon === "string" ? (
            <span role="img" aria-hidden="true">
              {action.icon}
            </span>
          ) : (
            action.icon
          )}
        </span>
        <span className="text-sm font-semibold tracking-tight text-foreground">
          {action.label}
        </span>
        {action.description && (
          <span className="text-xs text-muted-foreground">{action.description}</span>
        )}
      </Button>
    );

    if (isDisabled && action.disabledReason) {
      return (
        <Tooltip key={action.id} delayDuration={200}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>{action.disabledReason}</TooltipContent>
        </Tooltip>
      );
    }

    return button;
  };

  return (
    <TooltipProvider>
      <Card className="border border-border/60 bg-card/70 text-foreground shadow-lg backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base font-semibold tracking-tight text-foreground">
            {title}
          </CardTitle>
          {collapsible ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full border border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
              onClick={() => setIsCollapsed(!isCollapsed)}
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          ) : null}
        </CardHeader>

        {!isCollapsed && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {actions.map(renderAction)}
            </div>
          </CardContent>
        )}
      </Card>
    </TooltipProvider>
  );
};

export const commonActions = {
  services: [
    {
      id: "start-all",
      label: "Start All",
      icon: "▶️",
      description: "Start all services",
      disabledReason: "Service orchestration API is not connected yet.",
    },
    {
      id: "stop-all",
      label: "Stop All",
      icon: "⏹️",
      description: "Stop all services",
      variant: "danger" as const,
      disabledReason: "Service orchestration API is not connected yet.",
    },
    {
      id: "restart-all",
      label: "Restart All",
      icon: "🔄",
      description: "Restart all services",
      variant: "warning" as const,
      disabledReason: "Service orchestration API is not connected yet.",
    },
  ],
  logs: [
    {
      id: "clear-logs",
      label: "Clear Logs",
      icon: "🗑️",
      description: "Clear all logs",
      shortcut: "Ctrl+L",
      disabledReason: "Cloud log transport wiring is pending.",
    },
    {
      id: "download-logs",
      label: "Download",
      icon: "💾",
      description: "Download logs",
      shortcut: "Ctrl+S",
      disabledReason: "Cloud log transport wiring is pending.",
    },
    {
      id: "pause-logs",
      label: "Pause",
      icon: "⏸️",
      description: "Pause log streaming",
      shortcut: "Ctrl+Space",
      disabledReason: "Cloud log transport wiring is pending.",
    },
  ],
  navigation: [
    {
      id: "go-dashboard",
      label: "Dashboard",
      icon: "🏠",
      description: "Go to dashboard",
      disabledReason: "Navigation shortcuts will land once router states are shared.",
    },
    {
      id: "go-services",
      label: "Services",
      icon: "⚙️",
      description: "Go to services",
      disabledReason: "Navigation shortcuts will land once router states are shared.",
    },
    {
      id: "go-logs",
      label: "Logs",
      icon: "📋",
      description: "Go to logs",
      disabledReason: "Navigation shortcuts will land once router states are shared.",
    },
  ],
};
