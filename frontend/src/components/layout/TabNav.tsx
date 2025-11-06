import { Link, useLocation } from 'react-router-dom';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@/components/ui/navigation-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type TabType = 'local' | 'scripts' | 'deployed' | 'dev-bots';

interface Tab {
  id: TabType;
  label: string;
  path: string;
  description: string;
  statusBadge?: {
    label: string;
    variant: 'default' | 'success' | 'warning' | 'info' | 'destructive' | 'outline';
  };
}

const tabs: Tab[] = [
  {
    id: 'local',
    label: 'Local Control',
    path: '/local',
    description: 'Workstation services, process manager, and live ports',
    statusBadge: { label: '5 running', variant: 'success' },
  },
  {
    id: 'scripts',
    label: 'Scripts',
    path: '/scripts',
    description: 'Execute maintenance scripts and review recent runs',
    statusBadge: { label: 'queued', variant: 'warning' },
  },
  {
    id: 'deployed',
    label: 'Deployed Targets',
    path: '/deployed',
    description: 'Environment-aware health, Cloud logs, and release info',
    statusBadge: { label: '3 envs', variant: 'info' },
  },
  {
    id: 'dev-bots',
    label: 'Dev-Bots',
    path: '/dev-bots',
    description: 'Automation queue, worker telemetry, and task backlog',
    statusBadge: { label: '2 active', variant: 'default' },
  },
];

export function TabNav() {
  const location = useLocation();

  return (
    <NavigationMenu className="w-full">
      <NavigationMenuList className="w-full justify-start gap-2">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <NavigationMenuItem key={tab.id} className="w-full max-w-sm">
              <NavigationMenuLink
                asChild
                active={isActive}
                className="w-full"
              >
                <Link to={tab.path} className="flex w-full flex-col gap-2 text-left">
                  <span className={cn('text-sm font-medium tracking-tight', isActive && 'text-sm')}>
                    {tab.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{tab.description}</span>
                  {tab.statusBadge && (
                    <Badge variant={tab.statusBadge.variant} className="w-fit px-2">
                      {tab.statusBadge.label}
                    </Badge>
                  )}
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
