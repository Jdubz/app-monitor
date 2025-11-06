// Local storage service for persisting panel configurations

import {
  Panel,
  PanelLayout,
  SavedLayout,
  LayoutType,
} from "../types/panel.types";

const STORAGE_KEY = "app-monitor-panel-layout";
const SAVED_LAYOUTS_KEY = "app-monitor-saved-layouts";

export class PanelStorage {
  /**
   * Save current panel layout to localStorage
   */
  static saveCurrentLayout(panels: Panel[], layoutType: LayoutType): void {
    const layout: PanelLayout = {
      panels,
      layoutType,
      createdAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch (error) {
      console.error("Failed to save panel layout:", error);
    }
  }

  /**
   * Load current panel layout from localStorage
   */
  static loadCurrentLayout(): PanelLayout | null {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return null;

      const layout: PanelLayout = JSON.parse(data);
      return layout;
    } catch (error) {
      console.error("Failed to load panel layout:", error);
      return null;
    }
  }

  /**
   * Clear current layout
   */
  static clearCurrentLayout(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear panel layout:", error);
    }
  }

  /**
   * Save a named layout
   */
  static saveNamedLayout(
    name: string,
    panels: Panel[],
    layoutType: LayoutType,
  ): void {
    const savedLayout: SavedLayout = {
      name,
      panels,
      layoutType,
      createdAt: new Date().toISOString(),
    };

    try {
      const layouts = this.getAllSavedLayouts();
      layouts[name] = savedLayout;
      localStorage.setItem(SAVED_LAYOUTS_KEY, JSON.stringify(layouts));
    } catch (error) {
      console.error("Failed to save named layout:", error);
    }
  }

  /**
   * Load a named layout
   */
  static loadNamedLayout(name: string): SavedLayout | null {
    try {
      const layouts = this.getAllSavedLayouts();
      return layouts[name] || null;
    } catch (error) {
      console.error("Failed to load named layout:", error);
      return null;
    }
  }

  /**
   * Get all saved layouts
   */
  static getAllSavedLayouts(): Record<string, SavedLayout> {
    try {
      const data = localStorage.getItem(SAVED_LAYOUTS_KEY);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error("Failed to get saved layouts:", error);
      return {};
    }
  }

  /**
   * Delete a saved layout
   */
  static deleteNamedLayout(name: string): void {
    try {
      const layouts = this.getAllSavedLayouts();
      delete layouts[name];
      localStorage.setItem(SAVED_LAYOUTS_KEY, JSON.stringify(layouts));
    } catch (error) {
      console.error("Failed to delete layout:", error);
    }
  }

  /**
   * Export layout as JSON string
   */
  static exportLayout(name: string): string | null {
    const layout = this.loadNamedLayout(name);
    if (!layout) return null;

    return JSON.stringify(layout, null, 2);
  }

  /**
   * Import layout from JSON string
   */
  static importLayout(json: string): void {
    try {
      const layout: SavedLayout = JSON.parse(json);
      if (!layout.name || !layout.panels || !layout.layoutType) {
        throw new Error("Invalid layout format");
      }
      this.saveNamedLayout(layout.name, layout.panels, layout.layoutType);
    } catch (error) {
      console.error("Failed to import layout:", error);
      throw error;
    }
  }
}
