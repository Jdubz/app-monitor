import React from 'react';
import { PanelsTopLeft, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FilterDropdown } from '@/components/common/FilterDropdown';
import type { LayoutType } from '../../types/panel.types';

interface PanelToolbarProps {
  onAddPanel: () => void;
  onLayoutChange: (layout: LayoutType) => void;
  currentLayout: LayoutType;
  panelCount: number;
  maxPanels?: number;
}

const layoutOptions: Array<{ value: LayoutType; label: string }> = [
  { value: 'single', label: 'Single' },
  { value: 'horizontal', label: 'Horizontal Split' },
  { value: 'vertical', label: 'Vertical Stack' },
  { value: 'main-sidebar', label: 'Main + Sidebar' },
  { value: 'quad', label: 'Quad Grid' },
];

const PanelToolbar: React.FC<PanelToolbarProps> = ({
  onAddPanel,
  onLayoutChange,
  currentLayout,
  panelCount,
  maxPanels = 4,
}) => (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/80 px-4 py-3 shadow-sm">
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <PanelsTopLeft className="h-4 w-4 text-primary" />
        Log Panels
      </div>
      <Badge variant="outline" className="text-[10px] uppercase tracking-[0.3em]">
        {panelCount} / {maxPanels}
      </Badge>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        onClick={onAddPanel}
        disabled={panelCount >= maxPanels}
        className="gap-2"
        title="Add new panel"
      >
        <Plus className="h-4 w-4" />
        Add Panel
      </Button>

      <FilterDropdown
        label="Layout"
        value={currentLayout}
        onValueChange={(value) => onLayoutChange(value as LayoutType)}
        options={layoutOptions.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        placeholder="Select layout"
        title="Choose panel layout"
        className="min-w-[200px]"
        triggerClassName="h-9"
      />
    </div>
  </div>
);

export default PanelToolbar;
