import React, { useState, useEffect, useRef } from 'react';
import { LocalService } from '@jsdubzw/job-finder-shared-types';
import { useLogContext } from '../contexts/LogContext';
import { getLogSources } from '../services/api';
import MinimalLogsPanel from './MinimalLogsPanel';

interface PanelState {
  id: string;
  source: LocalService | null;
}

const STORAGE_KEY = 'app-monitor-panels';
const MAX_PANELS = 6;

const MinimalPanelContainer: React.FC = () => {
  const { getLogsForService, isConnected, subscribeToService } = useLogContext();
  const [panels, setPanels] = useState<PanelState[]>([{ id: '1', source: null }]);
  const [availableSources, setAvailableSources] = useState<LocalService[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(true);
  const isInitialMount = useRef(true);

  // Load panels from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPanels(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load panels from localStorage:', e);
    }
  }, []);

  // Save panels to localStorage whenever they change (skip initial mount)
  useEffect(() => {
    // Skip saving on initial mount to avoid overwriting loaded data
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(panels));
    } catch (e) {
      console.error('Failed to save panels to localStorage:', e);
    }
  }, [panels]);

  // Fetch available log sources from backend (dynamically discovered)
  useEffect(() => {
    const fetchSources = async () => {
      try {
        const logSources = await getLogSources();
        // Extract service names and deduplicate (multiple files may map to same service)
        const serviceNames = logSources.map(source => source.id as LocalService);
        const uniqueServiceNames = Array.from(new Set(serviceNames));
        setAvailableSources(uniqueServiceNames);
      } catch (error) {
        console.error('Failed to fetch available log sources:', error);
        // Fallback to empty list - user can retry by reloading
        setAvailableSources([]);
      } finally {
        setIsLoadingSources(false);
      }
    };

    fetchSources();
  }, []);

  // Subscribe to services when panel sources change to fetch historical logs
  useEffect(() => {
    panels.forEach(panel => {
      if (panel.source) {
        // Subscribe to service to get historical logs + real-time updates
        subscribeToService(panel.source);
      }
    });
  }, [panels, subscribeToService]);

  const addPanel = () => {
    if (panels.length >= MAX_PANELS) return;
    setPanels([...panels, { id: Date.now().toString(), source: null }]);
  };

  const removePanel = (id: string) => {
    if (panels.length <= 1) return;
    setPanels(panels.filter(p => p.id !== id));
  };

  const updatePanelSource = (id: string, source: LocalService) => {
    setPanels(panels.map(p => p.id === id ? { ...p, source } : p));
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#0d0d0d',
    position: 'relative',
  };

  const headerStyle: React.CSSProperties = {
    padding: '12px 16px',
    borderBottom: '1px solid #333',
    backgroundColor: '#1a1a1a',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const panelGridStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '12px',
    overflowY: 'auto',
    alignItems: 'stretch',
    alignContent: 'stretch',
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{
          fontSize: '16px',
          fontWeight: 600,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          Dev Monitor Logs
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '3px 8px',
            borderRadius: '10px',
            backgroundColor: isConnected ? '#28a745' : '#dc3545',
            color: '#fff',
          }}>
            {isConnected ? '● Connected' : '● Disconnected'}
          </div>
        </div>

        <button
          onClick={addPanel}
          disabled={panels.length >= MAX_PANELS}
          style={{
            padding: '6px 12px',
            backgroundColor: panels.length >= MAX_PANELS ? '#555' : '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: panels.length >= MAX_PANELS ? 'not-allowed' : 'pointer',
            fontWeight: 600,
          }}
          title={panels.length >= MAX_PANELS ? `Maximum ${MAX_PANELS} panels` : 'Add panel'}
        >
          + Add Panel ({panels.length}/{MAX_PANELS})
        </button>
      </div>

      {/* Panels Grid */}
      <div style={panelGridStyle}>
        {panels.map(panel => {
          const logs = panel.source ? getLogsForService(panel.source) : [];
          const hasError = panel.source !== null && !availableSources.includes(panel.source);
          const errorMessage = hasError
            ? `Source "${panel.source}" is not available. Please select a new source.`
            : undefined;

          return (
            <MinimalLogsPanel
              key={panel.id}
              panelId={panel.id}
              selectedSource={panel.source}
              availableSources={availableSources}
              logs={logs}
              isLoading={isLoadingSources}
              hasError={hasError}
              errorMessage={errorMessage}
              onSourceChange={(source) => updatePanelSource(panel.id, source)}
              onRemove={() => removePanel(panel.id)}
              canRemove={panels.length > 1}
            />
          );
        })}
      </div>
    </div>
  );
};

export default MinimalPanelContainer;
