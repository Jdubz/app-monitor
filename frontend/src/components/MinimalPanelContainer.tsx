import { useState, useEffect, useRef } from 'react';
import { LocalService } from '../types/shared.types';
import { useLogContext } from '../contexts/LogContext';
import { getLogSources } from '../services/api';
import MinimalLogsPanel from './MinimalLogsPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PanelState {
  id: string;
  source: LocalService | null;
}

const STORAGE_KEY = 'app-monitor-panels';
const MAX_PANELS = 6;

const LOG_SOURCE_TO_SERVICE: Record<string, LocalService> = {
  'app-monitor-backend': 'dev-monitor-backend',
  'app-monitor-frontend': 'frontend-dev',
  'job-finder-backend': 'firebase-emulators',
  'job-finder-frontend': 'frontend-dev',
  'job-finder-worker': 'python-worker',
};

const MinimalPanelContainer = () => {
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
        const serviceNames = logSources
          .map(source => LOG_SOURCE_TO_SERVICE[source.id])
          .filter((service): service is LocalService => Boolean(service));
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

  return (
    <div className="flex min-h-[380px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-black/80 text-foreground shadow-xl">
      <div className="flex items-center justify-between border-b border-border/60 bg-black/70 px-5 py-4">
        <div className="flex items-center gap-4 text-sm font-semibold tracking-tight">
          <span className="text-base uppercase tracking-[0.4em] text-muted-foreground">
            Dev Monitor Logs
          </span>
          <Badge
            variant={isConnected ? 'success' : 'destructive'}
            className={cn(
              'font-mono text-[10px] uppercase tracking-[0.3em]',
              !isConnected && 'animate-pulse',
            )}
          >
            {isConnected ? '● Connected' : '● Disconnected'}
          </Badge>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="rounded-full border-primary/40 bg-primary/10 text-primary-foreground hover:bg-primary/20"
          onClick={addPanel}
          disabled={panels.length >= MAX_PANELS}
          title={panels.length >= MAX_PANELS ? `Maximum ${MAX_PANELS} panels` : 'Add panel'}
        >
          + Add Panel ({panels.length}/{MAX_PANELS})
        </Button>
      </div>

      <div className="flex flex-1 flex-wrap gap-3 overflow-y-auto p-4">
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
