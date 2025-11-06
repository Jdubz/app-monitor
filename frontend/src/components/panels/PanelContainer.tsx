import React, { useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import type {
  DevMonitorLogLevel,
  LayoutType,
  LocalService,
  LogSource,
  Panel,
} from '../../types/panel.types';
import { PanelStorage } from '../../services/panelStorage';
import { useLogContext } from '../../contexts/LogContext';
import { filterLogs, getUniqueServices, sourceToServices } from '../../utils/panelFilters';
import PanelToolbar from './PanelToolbar';
import PanelWrapper from './PanelWrapper';
import LogsViewer from '../LogsViewer';

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);

const DEFAULT_LEVELS: DevMonitorLogLevel[] = ['INFO', 'WARN', 'ERROR', 'DEBUG'];

const createDefaultPanelState = (): Omit<Panel, 'id' | 'source'> => ({
  paused: false,
  showMetadata: true,
  searchText: '',
  selectedServices: [] as LocalService[],
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

const getPanelItemClasses = (layoutType: LayoutType, index: number): string => {
  if (layoutType === 'main-sidebar' && index === 0) {
    return 'md:[grid-row:span_2]';
  }
  return '';
};

const PanelContainer: React.FC = () => {
  const { getLogsForService, clearLogs, isConnected } = useLogContext();

  const [panels, setPanels] = useState<Panel[]>(() => [
    {
      id: createId(),
      source: 'local-all',
      ...createDefaultPanelState(),
    },
  ]);
  const [layoutType, setLayoutType] = useState<LayoutType>('single');
  const maxPanels = 4;

  useEffect(() => {
    const savedLayout = PanelStorage.loadCurrentLayout();
    if (!savedLayout || savedLayout.panels.length === 0) return;

    const normalizedPanels = savedLayout.panels.map((panel) => ({
      ...createDefaultPanelState(),
      ...panel,
      id: panel.id || createId(),
      source: panel.source || 'local-all',
      selectedLevels:
        panel.selectedLevels && panel.selectedLevels.length > 0
          ? panel.selectedLevels
          : [...DEFAULT_LEVELS],
    }));

    setPanels(normalizedPanels);
    setLayoutType(savedLayout.layoutType || 'single');
  }, []);

  useEffect(() => {
    if (panels.length === 0) return;
    PanelStorage.saveCurrentLayout(panels, layoutType);
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

  const addPanel = () => {
    if (panels.length >= maxPanels) return;
    setPanels((previous) => [
      ...previous,
      {
        id: createId(),
        source: 'local-all',
        ...createDefaultPanelState(),
        showMetadata: false,
      },
    ]);
  };

  const removePanel = (id: string) => {
    if (panels.length <= 1) return;
    setPanels((previous) => previous.filter((panel) => panel.id !== id));
  };

  const updatePanel = (id: string, updates: Partial<Panel>) => {
    setPanels((previous) =>
      previous.map((panel) => (panel.id === id ? { ...panel, ...updates } : panel)),
    );
  };

  const getFilteredLogsForPanel = (panel: Panel) => {
    const allLogs = getLogsForService('all');
    return filterLogs(allLogs, {
      source: panel.source,
      selectedServices: panel.selectedServices,
      selectedLevels: panel.selectedLevels,
      searchText: panel.searchText,
      paused: panel.paused,
    });
  };

  const getAvailableServicesForPanel = (panel: Panel): LocalService[] => {
    const sourceServices = sourceToServices(panel.source);
    const logsForSource = getLogsForService('all').filter((log) =>
      sourceServices.includes(log.service as LocalService),
    );
    return getUniqueServices(logsForSource);
  };

  const gridClasses = useMemo(
    () => cn('grid flex-1 gap-4 overflow-hidden px-4 pb-4 pt-2', getGridClasses(layoutType)),
    [layoutType],
  );

  return (
    <div className="relative flex h-full flex-col">
      <PanelToolbar
        onAddPanel={addPanel}
        onLayoutChange={setLayoutType}
        currentLayout={layoutType}
        panelCount={panels.length}
        maxPanels={maxPanels}
      />

      <div className={gridClasses}>
        {panels.map((panel, index) => {
          const filteredLogs = getFilteredLogsForPanel(panel);
          const availableServices = getAvailableServicesForPanel(panel);

          return (
            <PanelWrapper
              key={panel.id}
              panel={panel}
              className={getPanelItemClasses(layoutType, index)}
              onRemove={() => removePanel(panel.id)}
              onSourceChange={(source: LogSource) => updatePanel(panel.id, { source })}
              onMetadataToggle={() => updatePanel(panel.id, { showMetadata: !panel.showMetadata })}
              canRemove={panels.length > 1}
            >
              <LogsViewer
                logs={filteredLogs}
                availableServices={availableServices}
                selectedServices={panel.selectedServices}
                selectedLevels={panel.selectedLevels}
                searchText={panel.searchText}
                onToggleService={(service) => {
                  const nextSelection = panel.selectedServices.includes(service)
                    ? panel.selectedServices.filter((item) => item !== service)
                    : [...panel.selectedServices, service];
                  updatePanel(panel.id, { selectedServices: nextSelection });
                }}
                onToggleLevel={(level) => {
                  const nextLevels = panel.selectedLevels.includes(level)
                    ? panel.selectedLevels.filter((item) => item !== level)
                    : [...panel.selectedLevels, level];
                  updatePanel(panel.id, { selectedLevels: nextLevels });
                }}
                onSearchChange={(text) => updatePanel(panel.id, { searchText: text })}
                onSelectAllServices={() => updatePanel(panel.id, { selectedServices: [] })}
                onSelectAllLevels={() => updatePanel(panel.id, { selectedLevels: [...DEFAULT_LEVELS] })}
                onClearAllLevels={() => updatePanel(panel.id, { selectedLevels: [] })}
                onClearSearch={() => updatePanel(panel.id, { searchText: '' })}
                showMetadata={panel.showMetadata}
                isPaused={panel.paused}
                onTogglePause={() => updatePanel(panel.id, { paused: !panel.paused })}
                onClear={() => {
                  sourceToServices(panel.source).forEach((service) => clearLogs(service));
                }}
              />
            </PanelWrapper>
          );
        })}
      </div>

      <div
        className={cn(
          'pointer-events-none absolute top-3 right-3 flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold shadow',
          isConnected
            ? 'bg-emerald-500/90 text-emerald-950'
            : 'bg-destructive/80 text-destructive-foreground',
        )}
      >
        <span className="block h-2 w-2 rounded-full bg-current" />
        {isConnected ? 'Live connection' : 'Disconnected'}
      </div>
    </div>
  );
};

export default PanelContainer;
