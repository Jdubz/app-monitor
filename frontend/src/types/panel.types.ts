// Panel types for multi-panel log viewer
// Re-export from local shared types

import type {
  LogSource,
  PanelConfig,
  PanelLayoutType,
  SavedPanelLayout,
  LocalService,
  DevMonitorLogLevel,
} from './shared.types';

// Re-export all types
export type { LogSource, PanelConfig, PanelLayoutType, SavedPanelLayout, LocalService, DevMonitorLogLevel };

// Type aliases for convenience
export type Panel = PanelConfig;
export type LayoutType = PanelLayoutType;

// Extended layout type for backwards compatibility
export interface PanelLayout {
  panels: Panel[];
  layoutType: LayoutType;
  createdAt?: string;
}

export interface SavedLayout extends PanelLayout {
  name: string;
}
