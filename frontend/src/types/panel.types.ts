// Panel types for multi-panel log viewer
// Re-export from shared-types for consistency

export {
  type LogSource,
  type PanelConfig,
  type PanelLayoutType,
  type SavedPanelLayout,
  type LocalService,
  type DevMonitorLogLevel,
} from '@jsdubzw/job-finder-shared-types';

// Extended layout type for backwards compatibility
export interface PanelLayout {
  panels: Panel[];
  layoutType: LayoutType;
  createdAt?: string;
}

export interface SavedLayout extends PanelLayout {
  name: string;
}

// Re-import for correct typing
import { PanelConfig, PanelLayoutType } from '@jsdubzw/job-finder-shared-types';
export type Panel = PanelConfig;
export type LayoutType = PanelLayoutType;
