import React, { useState, useEffect, useMemo } from 'react';
import { Socket } from 'socket.io-client';
import { useCloudLogs } from '../hooks/useCloudLogs';
import { useLogFilter } from '../hooks/useLogFilter';
import { getEnvironmentServices } from '../services/api';
import { CloudService } from '../types/log.types';
import { Panel, LayoutType, LogSource } from '../types/panel.types';
import { PanelStorage } from '../services/panelStorage';
import PanelToolbar from './panels/PanelToolbar';
import CloudLogsViewer from './CloudLogsViewer';
import '../styles/panel-layouts.css';

interface CloudPanelContainerProps {
  socket: Socket | null;
  environments: Record<string, import('../types/log.types').Environment>;
}

interface CloudPanel extends Panel {
  environment: string;
  service: string;
  severity?: string;
}

const CloudPanelContainer: React.FC<CloudPanelContainerProps> = ({
  socket,
  environments
}) => {
  // Filter out local environment - only show deployed environments
  const deployedEnvironments = useMemo(() => {
    return Object.keys(environments)
      .filter(key => key !== 'local')
      .reduce((acc, key) => {
        acc[key] = environments[key];
        return acc;
      }, {} as Record<string, import('../types/log.types').Environment>);
  }, [environments]);

  // Default to staging or first available deployed environment
  const defaultEnvironment = useMemo(() => {
    return deployedEnvironments.staging ? 'staging' : Object.keys(deployedEnvironments)[0] || 'staging';
  }, [deployedEnvironments]);

  const [panels, setPanels] = useState<CloudPanel[]>([
    {
      id: '1',
      source: `${defaultEnvironment}-all` as LogSource,
      environment: defaultEnvironment,
      service: 'all-functions',
      paused: false,
      showMetadata: true,
      searchText: '',
      selectedServices: [],
      selectedLevels: ['INFO', 'WARN', 'ERROR', 'DEBUG'],
    },
  ]);

  const [layoutType, setLayoutType] = useState<LayoutType>('single');
  const [services, setServices] = useState<CloudService[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const maxPanels = 4;

  // Load saved layout on mount
  useEffect(() => {
    const savedLayout = PanelStorage.loadCurrentLayout();
    if (savedLayout && savedLayout.panels.length > 0) {
      // Convert saved panels to cloud panels, preserving environment from source
      const cloudPanels = savedLayout.panels.map(panel => {
        // Extract environment from source (e.g., "staging-all" -> "staging")
        const envFromSource = (panel.source as string).split('-')[0];
        return {
          ...panel,
          environment: envFromSource,
          service: 'all-functions',
        };
      });
      setPanels(cloudPanels);
      setLayoutType(savedLayout.layoutType);
    }
  }, []);

  // Save layout whenever it changes
  useEffect(() => {
    if (panels.length > 0) {
      // Convert cloud panels back to regular panels for storage
      const regularPanels = panels.map(({ environment: _environment, service: _service, ...panel }) => panel);
      PanelStorage.saveCurrentLayout(regularPanels, layoutType);
    }
  }, [panels, layoutType]);

  // Fetch services for all deployed environments
  useEffect(() => {
    const fetchAllServices = async () => {
      try {
        // Fetch services from all deployed environments (excluding local)
        const allServicesPromises = Object.keys(deployedEnvironments).map(async (env) => {
          const envServices = await getEnvironmentServices(env);
          return envServices.map(svc => ({ ...svc, environment: env }));
        });
        const allServicesArrays = await Promise.all(allServicesPromises);
        const allServices = allServicesArrays.flat();
        setServices(allServices);
      } catch (error) {
        console.error('Failed to fetch services:', error);
      } finally {
        setIsLoadingServices(false);
      }
    };

    if (Object.keys(deployedEnvironments).length > 0) {
      fetchAllServices();
    }
  }, [deployedEnvironments]);

  // Auto-adjust layout when adding panels
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

  // Add a new panel
  const addPanel = () => {
    if (panels.length >= maxPanels) return;

    const newPanel: CloudPanel = {
      id: Date.now().toString(),
      source: `${defaultEnvironment}-all` as LogSource,
      environment: defaultEnvironment,
      service: 'all-functions',
      paused: false,
      showMetadata: true,
      searchText: '',
      selectedServices: [],
      selectedLevels: ['INFO', 'WARN', 'ERROR', 'DEBUG'],
    };

    setPanels([...panels, newPanel]);
  };

  // Remove a panel
  const removePanel = (id: string) => {
    if (panels.length <= 1) return;
    setPanels(panels.filter((p) => p.id !== id));
  };

  // Update panel state
  const updatePanel = (id: string, updates: Partial<CloudPanel>) => {
    setPanels(panels.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  // Handle source change - extract environment from source and update both
  const handleSourceChange = (id: string, source: LogSource) => {
    // Extract environment from source (e.g., "staging-all" -> "staging")
    const environment = (source as string).split('-')[0];
    updatePanel(id, { source, environment });
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  };

  return (
    <div style={containerStyle} className="panel-container">
      <PanelToolbar
        onAddPanel={addPanel}
        onLayoutChange={setLayoutType}
        currentLayout={layoutType}
        panelCount={panels.length}
        maxPanels={maxPanels}
      />

      <div className={`panel-grid layout-${layoutType}`}>
        {panels.map((panel) => {
          return (
            <CloudPanelWrapper
              key={panel.id}
              panel={panel}
              socket={socket}
              environments={deployedEnvironments}
              services={services}
              isLoadingServices={isLoadingServices}
              onRemove={() => removePanel(panel.id)}
              onSourceChange={(source: LogSource) => handleSourceChange(panel.id, source)}
              onMetadataToggle={() => updatePanel(panel.id, { showMetadata: !panel.showMetadata })}
              onServiceChange={(service) => updatePanel(panel.id, { service })}
              onSeverityChange={(severity) => updatePanel(panel.id, { severity })}
              canRemove={panels.length > 1}
            />
          );
        })}
      </div>
    </div>
  );
};

interface CloudPanelWrapperProps {
  panel: CloudPanel;
  socket: Socket | null;
  environments: Record<string, import('../types/log.types').Environment>;
  services: CloudService[];
  isLoadingServices: boolean;
  onRemove: () => void;
  onSourceChange: (source: LogSource) => void;
  onMetadataToggle: () => void;
  onServiceChange: (service: string) => void;
  onSeverityChange: (severity: string) => void;
  canRemove: boolean;
}

const CloudPanelWrapper: React.FC<CloudPanelWrapperProps> = ({
  panel,
  socket,
  environments,
  services,
  isLoadingServices,
  onRemove,
  onSourceChange,
  onMetadataToggle,
  onServiceChange,
  onSeverityChange,
  canRemove,
}) => {
  // Filter services for current panel's environment
  const panelServices = services.filter(svc =>
    (svc as any).environment === panel.environment
  );
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
  } = useLogFilter(logs);

  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#1a1a1a',
    border: '1px solid #444',
    borderRadius: '8px',
    overflow: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: '#2a2a2a',
    borderBottom: '1px solid #444',
    flexWrap: 'wrap',
  };

  const selectStyle: React.CSSProperties = {
    padding: '4px 6px',
    backgroundColor: '#1a1a1a',
    color: '#e0e0e0',
    border: '1px solid #444',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
    minWidth: '120px',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '4px 8px',
    backgroundColor: '#4dabf7',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: 600,
  };

  const removeButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: canRemove ? '#dc3545' : '#555',
    cursor: canRemove ? 'pointer' : 'not-allowed',
    opacity: canRemove ? 1 : 0.5,
  };

  const contentStyle: React.CSSProperties = {
    flex: 1,
    overflow: 'hidden',
  };

  return (
    <div style={wrapperStyle}>
      <div style={headerStyle}>
        <select
          value={panel.source}
          onChange={(e) => onSourceChange(e.target.value as LogSource)}
          style={selectStyle}
          title="Select environment"
        >
          {Object.keys(environments).map(env => (
            <option key={env} value={`${env}-all`}>
              {env.charAt(0).toUpperCase() + env.slice(1)} - All
            </option>
          ))}
        </select>

        <select
          value={panel.service}
          onChange={(e) => onServiceChange(e.target.value)}
          style={selectStyle}
          title="Select service"
          disabled={isLoadingServices}
        >
          <option value="all-functions">All Functions</option>
          {panelServices.map(svc => (
            <option key={svc.name} value={svc.name}>
              {svc.displayName}
            </option>
          ))}
        </select>

        <select
          value={panel.severity || ''}
          onChange={(e) => onSeverityChange(e.target.value)}
          style={selectStyle}
          title="Select severity"
        >
          <option value="">All Severities</option>
          <option value="DEBUG">DEBUG</option>
          <option value="INFO">INFO</option>
          <option value="WARNING">WARNING</option>
          <option value="ERROR">ERROR</option>
        </select>

        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            onClick={() => refreshLogs()}
            disabled={isLoading}
            style={buttonStyle}
            title="Refresh logs"
          >
            {isLoading ? '...' : '↻'}
          </button>

          <button
            onClick={() => clearLogs()}
            style={{ ...buttonStyle, backgroundColor: '#868e96' }}
            title="Clear logs"
          >
            🗑
          </button>

          <button
            onClick={onMetadataToggle}
            style={{
              ...buttonStyle,
              backgroundColor: panel.showMetadata ? '#4dabf7' : '#555',
            }}
            title="Toggle metadata"
          >
            📊
          </button>

          <button
            onClick={onRemove}
            disabled={!canRemove}
            style={removeButtonStyle}
            title={canRemove ? 'Remove panel' : 'Cannot remove last panel'}
          >
            ✕
          </button>
        </div>
      </div>

      <div style={contentStyle}>
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
          onRefresh={refreshLogs}
          onClear={clearLogs}
        />
      </div>
    </div>
  );
};

export default CloudPanelContainer;
