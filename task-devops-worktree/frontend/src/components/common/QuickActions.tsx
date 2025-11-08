import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  description?: string;
  shortcut?: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning';
}

export interface QuickActionsProps {
  actions: QuickAction[];
  title?: string;
  collapsible?: boolean;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  actions,
  title = 'Quick Actions',
  collapsible = true,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleActionClick = (action: QuickAction) => {
    action.onClick();
  };

  const variantClasses: Record<NonNullable<QuickAction['variant']>, string> = {
    primary: 'border-primary/40 bg-primary/10 text-primary-foreground hover:bg-primary/20 hover:text-primary-foreground',
    secondary: 'border-border bg-background/60 hover:bg-muted/40 text-foreground',
    success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20',
    danger: 'border-rose-500/40 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25',
    warning: 'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20',
  };

  return (
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
          >
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        ) : null}
      </CardHeader>

      {!isCollapsed && (
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {actions.map((action) => {
              const variantClass =
                variantClasses[action.variant ?? 'primary'];

              return (
                <Button
                  key={action.id}
                  variant="outline"
                  className={cn(
                    'relative h-auto min-h-[92px] w-full flex-1 flex-col items-start gap-3 rounded-xl border border-border/60 bg-background/80 px-4 py-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg',
                    variantClass,
                  )}
                  onClick={() => handleActionClick(action)}
                  title={action.description}
                >
                  {action.shortcut && (
                    <span className="absolute right-3 top-3 rounded-full bg-black/40 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                      {action.shortcut}
                    </span>
                  )}
                  <span className="text-2xl leading-none">{action.icon}</span>
                  <span className="text-sm font-semibold tracking-tight text-foreground">
                    {action.label}
                  </span>
                  {action.description && (
                    <span className="text-xs text-muted-foreground">
                      {action.description}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

// Preset action groups
export const commonActions = {
  services: [
    {
      id: 'start-all',
      label: 'Start All',
      icon: '▶️',
      description: 'Start all services',
      onClick: () => console.log('Start all services'),
    },
    {
      id: 'stop-all',
      label: 'Stop All',
      icon: '⏹️',
      description: 'Stop all services',
      variant: 'danger' as const,
      onClick: () => console.log('Stop all services'),
    },
    {
      id: 'restart-all',
      label: 'Restart All',
      icon: '🔄',
      description: 'Restart all services',
      variant: 'warning' as const,
      onClick: () => console.log('Restart all services'),
    },
  ],
  logs: [
    {
      id: 'clear-logs',
      label: 'Clear Logs',
      icon: '🗑️',
      description: 'Clear all logs',
      shortcut: 'Ctrl+L',
      onClick: () => console.log('Clear logs'),
    },
    {
      id: 'download-logs',
      label: 'Download',
      icon: '💾',
      description: 'Download logs',
      shortcut: 'Ctrl+S',
      onClick: () => console.log('Download logs'),
    },
    {
      id: 'pause-logs',
      label: 'Pause',
      icon: '⏸️',
      description: 'Pause log streaming',
      shortcut: 'Ctrl+Space',
      onClick: () => console.log('Pause logs'),
    },
  ],
  navigation: [
    {
      id: 'go-dashboard',
      label: 'Dashboard',
      icon: '🏠',
      description: 'Go to dashboard',
      onClick: () => console.log('Navigate to dashboard'),
    },
    {
      id: 'go-services',
      label: 'Services',
      icon: '⚙️',
      description: 'Go to services',
      onClick: () => console.log('Navigate to services'),
    },
    {
      id: 'go-logs',
      label: 'Logs',
      icon: '📋',
      description: 'Go to logs',
      onClick: () => console.log('Navigate to logs'),
    },
  ],
};
