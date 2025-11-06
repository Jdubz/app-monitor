import React, { useRef, useState } from 'react';
import { Check, Copy, Eye, EyeOff, Trash2 } from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Panel, LogSource } from '../../types/panel.types';

interface PanelWrapperProps {
  panel: Panel;
  onRemove: () => void;
  onSourceChange: (source: LogSource) => void;
  onMetadataToggle: () => void;
  canRemove: boolean;
  children: React.ReactNode;
  className?: string;
}

const sourceOptions: Array<{ value: LogSource; label: string }> = [
  { value: 'local-all', label: 'Local - All Services' },
  { value: 'local-frontend', label: 'Local - Frontend' },
  { value: 'local-backend', label: 'Local - Backend' },
  { value: 'local-worker', label: 'Local - Worker' },
  { value: 'local-dev-monitor', label: 'Local - Dev Monitor' },
  { value: 'staging-all', label: 'Staging - All' },
  { value: 'production-all', label: 'Production - All' },
];

const PanelWrapper: React.FC<PanelWrapperProps> = ({
  panel,
  onRemove,
  onSourceChange,
  onMetadataToggle,
  canRemove,
  children,
  className,
}) => {
  const [copyFeedback, setCopyFeedback] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleCopyAll = async () => {
    if (!panelRef.current) return;
    await navigator.clipboard.writeText(panelRef.current.innerText);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
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
            onChange={(event) => onSourceChange(event.target.value as LogSource)}
            className="h-9 rounded-md border border-border/60 bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Select log source"
          >
            {sourceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={panel.showMetadata ? 'secondary' : 'outline'}
            size="sm"
            onClick={onMetadataToggle}
            className="gap-2"
          >
            {panel.showMetadata ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            Metadata
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyAll}
            className="gap-2"
          >
            {copyFeedback ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copyFeedback ? 'Copied' : 'Copy'}
          </Button>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onRemove}
            disabled={!canRemove}
            className="gap-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <div ref={panelRef} className="h-full w-full overflow-hidden">
          {children}
        </div>
      </CardContent>
    </Card>
  );
};

export default PanelWrapper;
