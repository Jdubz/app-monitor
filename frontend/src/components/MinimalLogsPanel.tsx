import { useState, useRef, useEffect } from 'react';
import { DevMonitorLogLine, LocalService } from '../types/shared.types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FilterDropdown } from '@/components/common/FilterDropdown';
import { cn } from '@/lib/utils';

interface MinimalLogsPanelProps {
  panelId: string;
  selectedSource: LocalService | null;
  availableSources: LocalService[];
  logs: DevMonitorLogLine[];
  isLoading: boolean;
  hasError: boolean;
  errorMessage?: string;
  onSourceChange: (source: LocalService) => void;
  onRemove: () => void;
  canRemove: boolean;
}

const MinimalLogsPanel = ({
  selectedSource,
  availableSources,
  logs,
  isLoading,
  hasError,
  errorMessage,
  onSourceChange,
  onRemove,
  canRemove,
}: MinimalLogsPanelProps) => {
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const filteredLogs = showErrorsOnly ? logs.filter(log => log.level === 'ERROR') : logs;

  return (
    <div className="flex min-w-[340px] flex-1 flex-col rounded-xl border border-border/60 bg-black/85 shadow-inner">
      <div className="flex items-center gap-3 border-b border-border/60 bg-black/70 px-3 py-2">
        <FilterDropdown
          label="Source"
          value={selectedSource ?? undefined}
          onValueChange={(value) => onSourceChange(value as LocalService)}
          options={
            availableSources.length > 0
              ? availableSources.map((source) => ({
                  value: source,
                  label: source,
                }))
              : [{ value: 'none', label: 'No sources available', disabled: true }]
          }
          placeholder="Select source..."
          title="Select source"
          disabled={isLoading || availableSources.length === 0}
          className="flex-1"
          triggerClassName="w-full"
        />

        <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          <input
            type="checkbox"
            checked={showErrorsOnly}
            onChange={(e) => setShowErrorsOnly(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Errors
        </label>

        {canRemove && (
          <Button
            variant="destructive"
            size="icon"
            onClick={onRemove}
            title="Remove panel"
            className="h-7 w-7 rounded-full"
          >
            ×
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 font-mono text-[12px] leading-relaxed">
        {isLoading && (
          <div className="flex h-[260px] flex-col items-center justify-center gap-3 text-muted-foreground">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-border/80 border-t-primary" />
            <span className="text-xs uppercase tracking-[0.3em]">Loading logs…</span>
          </div>
        )}

        {!isLoading && hasError && (
          <div className="flex h-[260px] items-center justify-center px-4 text-center">
            <div className="w-full rounded-lg border border-destructive/40 bg-destructive/15 p-4 text-xs text-destructive-foreground shadow">
              <div className="mb-2 font-semibold uppercase tracking-[0.3em]">Error</div>
              <div>{errorMessage || 'Invalid source. Please select a new source.'}</div>
            </div>
          </div>
        )}

        {!isLoading && !hasError && (
          <>
            {filteredLogs.length === 0 ? (
              <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                <span className="text-3xl">🛰️</span>
                <span className="uppercase tracking-[0.3em]">No logs yet</span>
              </div>
            ) : (
              <div className="space-y-2 px-3 py-2">
                {filteredLogs.map(log => (
                  <div
                    key={log.id}
                    className={cn(
                      'rounded-lg border border-border/40 bg-black/60 px-3 py-2 shadow-sm transition hover:bg-black/40',
                      log.level === 'ERROR' && 'border-rose-500/40 bg-rose-500/10',
                      log.level === 'WARN' && 'border-amber-500/40 bg-amber-500/10',
                    )}
                  >
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.4em] text-muted-foreground/80">
                      <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      <Badge variant="outline" className="border-border/60 bg-background/40 font-mono text-[10px]">
                        {log.level}
                      </Badge>
                    </div>
                    <div className="mt-1 font-mono text-xs text-slate-200">
                      {log.message}
                    </div>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </>
        )}
      </ScrollArea>
    </div>
  );
};

export default MinimalLogsPanel;
