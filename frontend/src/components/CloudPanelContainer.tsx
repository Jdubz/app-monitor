import React, { useEffect, useMemo, useState } from 'react';
import { Socket } from 'socket.io-client';
import {
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { LayoutType, LogSource, Panel, DevMonitorLogLevel } from '../types/panel.types';
import type { CloudService, Environment, ParsedCloudLog } from '../types/log.types';
import { getEnvironmentServices } from '../services/api';
import { PanelStorage } from '../services/panelStorage';
import PanelToolbar from './panels/PanelToolbar';
import CloudLogsViewer from './CloudLogsViewer';
import { useCloudLogs } from '../hooks/useCloudLogs';
import { useLogFilter } from '../hooks/useLogFilter';

interface CloudPanelContainerProps {
  socket: Socket | null;
  environments: Record<string, Environment>;
}

interface CloudPanel extends Panel {
  environment: string;
  service: string;
  severity?: string;
}

type CloudServiceWithEnvironment = CloudService & { environment: string };

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);

const DEFAULT_LEVELS: DevMonitorLogLevel[] = ['INFO', 'WARN', 'ERROR', 'DEBUG'];

const createBasePanelState = (): Omit<CloudPanel, 'id' | 'source' | 'environment' | 'service'> => ({
  paused: false,
  showMetadata: true,
  searchText: '',
  selectedServices: [],
  selectedLevels: [...DEFAULT_LEVELS],
});

const getGridClasses = (layoutType: LayoutType): string => {
  switch (layoutType) {
    case 'horizontal':
      return 'grid-cols-1 md:grid-cols-2';
    case 'vertical':
      return 'grid-cols-1 md:grid-cols-1 md:grid-rows-2';
    case 'main-sidebar':
      return 'grid-cols-1 md:[grid-template-columns:minmax(0,2fr)_minmax(0,1fr)] md:[grid-template-rows:repeat(2,minmax(0,1fr))]';
    case 'quad':
      return 'grid-cols-1 md:grid-cols-2 md:grid-rows-2';
    case 'single':
    default:
      return 'grid-cols-1';
  }
};

const getPanelItemClasses = (layoutType: LayoutType, index: number): string =>
  layoutType === 'main-sidebar' && index === 0 ? 'md:[grid-row:span_2]' : '';

const CloudPanelContainer: React.FC<CloudPanelContainerProps> = ({ socket, environments }) => {
  const deployedEnvironments = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(environments).filter(([key]) => key !== 'local'),
      ),
    [environments],
  );

  const defaultEnvironment = useMemo(() => {
    if (deployedEnvironments.staging) return 'staging';
    const [firstEnv] = Object.keys(deployedEnvironments);
    return firstEnv ?? 'staging';
  }, [deployedEnvironments]);

  const [panels, setPanels] = useState<CloudPanel[]>(() => [
    {
      id: createId(),
      source: `${defaultEnvironment}-all`,
      environment: defaultEnvironment,
      service: 'all-functions',
      ...createBasePanelState(),
    },
  ]);
  const [layoutType, setLayoutType] = useState<LayoutType>('single');
  const [services, setServices] = useState<CloudServiceWithEnvironment[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);

  const maxPanels = 4;

  useEffect(() => {
    const savedLayout = PanelStorage.loadCurrentLayout();
    if (!savedLayout || savedLayout.panels.length === 0) return;

    const restoredPanels = savedLayout.panels.map((panelConfig) => {
      const persistedPanel = panelConfig as Partial<CloudPanel>;
      const fallbackSource = persistedPanel.source ?? `${defaultEnvironment}-all`;
      const fallbackEnvironment = fallbackSource.split('-')[0] || defaultEnvironment;

      return {
        ...createBasePanelState(),
        ...persistedPanel,
        id: persistedPanel.id ?? createId(),
        source: fallbackSource,
        environment: fallbackEnvironment,
        service: persistedPanel.service ?? 'all-functions',
        severity: persistedPanel.severity,
        selectedLevels:
          persistedPanel.selectedLevels && persistedPanel.selectedLevels.length > 0
            ? persistedPanel.selectedLevels
            : [...DEFAULT_LEVELS],
      };
    });

    setPanels(restoredPanels);
    setLayoutType(savedLayout.layoutType || 'single');
  }, [defaultEnvironment]);

  useEffect(() => {
    if (panels.length === 0) return;
    const persistedPanels = panels.map(({ environment: _env, service: _svc, ...panel }) => panel);
    PanelStorage.saveCurrentLayout(persistedPanels, layoutType);
  }, [panels, layoutType]);

  useEffect(() => {
    const count = panels.length;
    if (count === 2 && layoutType === 'single') {
      setLayoutType('horizontal');
    } else if (count === 3 && layoutType === 'horizontal') {
      setLayoutType('main-sidebar');
    } else if (count === 4 && layoutType === 'main-sidebar') {
      setLayoutType('quad');
    } else if (count === 1 && layoutType !== 'single') {
      setLayoutType('single');
    }
  }, [panels.length, layoutType]);

  useEffect(() => {
    const fetchAllServices = async () => {
      try {
        const serviceArrays = await Promise.all(
          Object.keys(deployedEnvironments).map(async (environment) => {
            const envServices = await getEnvironmentServices(environment);
            return envServices.map((svc) => ({ ...svc, environment }));
          }),
        );
        setServices(serviceArrays.flat());
      } catch (error) {
        console.error('Failed to fetch services:', error);
      } finally {
        setIsLoadingServices(false);
      }
    };

    if (Object.keys(deployedEnvironments).length > 0) {
      fetchAllServices();
    } else {
      setIsLoadingServices(false);
    }
  }, [deployedEnvironments]);

  const addPanel = () => {
    if (panels.length >= maxPanels) return;
    setPanels((previous) => [
      ...previous,
      {
        id: createId(),
        source: `${defaultEnvironment}-all`,
        environment: defaultEnvironment,
        service: 'all-functions',
        ...createBasePanelState(),
      },
    ]);
  };

  const removePanel = (id: string) => {
    if (panels.length <= 1) return;
    setPanels((previous) => previous.filter((panel) => panel.id !== id));
  };

  const updatePanel = (id: string, updates: Partial<CloudPanel>) => {
    setPanels((previous) =>
      previous.map((panel) => (panel.id === id ? { ...panel, ...updates } : panel)),
    );
  };

  const gridClasses = useMemo(
    () => cn('grid flex-1 gap-4 overflow-hidden px-4 pb-4 pt-2', getGridClasses(layoutType)),
    [layoutType],
  );

  return (
    <div className="flex h-full flex-col">
      <PanelToolbar
        onAddPanel={addPanel}
        onLayoutChange={setLayoutType}
        currentLayout={layoutType}
        panelCount={panels.length}
        maxPanels={maxPanels}
      />

      <div className={gridClasses}>
        {panels.map((panel, index) => (
          <CloudPanelCard
            key={panel.id}
            className={getPanelItemClasses(layoutType, index)}
            panel={panel}
            socket={socket}
            environments={deployedEnvironments}
            services={services}
            isLoadingServices={isLoadingServices}
            onRemove={() => removePanel(panel.id)}
            onPanelUpdate={(updates) => updatePanel(panel.id, updates)}
          />
        ))}
      </div>
    </div>
  );
};

interface CloudPanelCardProps {
  panel: CloudPanel;
  socket: Socket | null;
  environments: Record<string, Environment>;
  services: CloudServiceWithEnvironment[];
  isLoadingServices: boolean;
  onRemove: () => void;
  onPanelUpdate: (updates: Partial<CloudPanel>) => void;
  className?: string;
}

const CloudPanelCard: React.FC<CloudPanelCardProps> = ({
  panel,
  socket,
  environments,
  services,
  isLoadingServices,
  onRemove,
  onPanelUpdate,
  className,
}) => {
  const panelServices = services.filter((svc) => svc.environment === panel.environment);

  const { logs, isLoading, error, cloudLoggingStatus, refreshLogs, clearLogs } = useCloudLogs({
    socket,
    environment: panel.environment,
    service: panel.service,
    severity: panel.severity,
  });

  const {
    filteredLogs,
    selectedLevels,
    searchText,
    setSearchText,
    toggleLevel,
    selectAllLevels,
    clearAllLevels,
    clearSearch,
  } = useLogFilter<ParsedCloudLog>(logs);

  const handleSourceChange = (value: LogSource) => {
    const environment = value.split('-')[0] || panel.environment;
    onPanelUpdate({
      source: value,
      environment,
      service: 'all-functions',
      severity: undefined,
    });
  };

  return (
    <Card
      className={cn(
        'flex h-full flex-col border border-border/60 bg-card/70 text-foreground shadow-md transition hover:border-border',
        className,
      )}
    >
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-card/80 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={panel.source}
            onChange={(event) => handleSourceChange(event.target.value as LogSource)}
            className="h-9 rounded-md border border-border/60 bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Select environment"
          >
            {Object.keys(environments).map((env) => (
              <option key={env} value={`${env}-all`}>
                {environments[env].displayName ?? env}
              </option>
            ))}
          </select>

          <select
            value={panel.service}
            onChange={(event) => onPanelUpdate({ service: event.target.value })}
            disabled={isLoadingServices}
            className="h-9 rounded-md border border-border/60 bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            title="Select service"
          >
            <option value="all-functions">All Functions</option>
            {panelServices.map((svc) => (
              <option key={svc.name} value={svc.name}>
                {svc.displayName}
              </option>
            ))}
          </select>

          <select
            value={panel.severity ?? ''}
            onChange={(event) => onPanelUpdate({ severity: event.target.value || undefined })}
            className="h-9 rounded-md border border-border/60 bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Select severity"
          >
            <option value="">All Severities</option>
            <option value="DEBUG">DEBUG</option>
            <option value="INFO">INFO</option>
            <option value="WARNING">WARNING</option>
            <option value="ERROR">ERROR</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {cloudLoggingStatus && (
            <Badge
              variant={cloudLoggingStatus.available ? 'success' : 'destructive'}
              className="text-[10px] uppercase tracking-[0.2em]"
            >
              {cloudLoggingStatus.available ? 'Connected' : 'Unavailable'}
            </Badge>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refreshLogs()}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => clearLogs()}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Clear
          </Button>

          <Button
            type="button"
            variant={panel.showMetadata ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => onPanelUpdate({ showMetadata: !panel.showMetadata })}
            className="gap-2"
          >
            {panel.showMetadata ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            Metadata
          </Button>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onRemove}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 border-b border-border/60 bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading cloud logs…
          </div>
        )}

        {error && (
          <div className="border-b border-destructive/40 bg-destructive/15 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <CloudLogsViewer
            logs={filteredLogs}
            isLoading={isLoading}
            error={error}
            cloudLoggingStatus={cloudLoggingStatus}
            searchText={searchText}
            selectedLevels={selectedLevels}
            showMetadata={panel.showMetadata}
            onSearchChange={setSearchText}
            onToggleLevel={toggleLevel}
            onSelectAllLevels={selectAllLevels}
            onClearAllLevels={clearAllLevels}
            onClearSearch={clearSearch}
            onRefresh={() => refreshLogs()}
            onClear={() => clearLogs()}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default CloudPanelContainer;
