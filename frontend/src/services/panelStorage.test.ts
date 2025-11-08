import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { PanelStorage } from './panelStorage';
import type { LayoutType, Panel } from '../types/panel.types';

const samplePanels: Panel[] = [
  {
    id: 'panel-1',
    source: 'local-all',
    paused: false,
    showMetadata: true,
    searchText: '',
    selectedServices: [],
    selectedLevels: ['INFO', 'WARN', 'ERROR', 'DEBUG'],
  },
];

const layoutType: LayoutType = 'horizontal';
const originalLocalStorage = window.localStorage;

const createMemoryStorage = () => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => (store.has(key) ? store.get(key)! : null)),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => store.delete(key)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  } as Storage;
};

describe('PanelStorage', () => {
  beforeEach(() => {
    window.localStorage = createMemoryStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage = originalLocalStorage;
  });

  it('persists and retrieves the active layout', () => {
    PanelStorage.saveCurrentLayout(samplePanels, layoutType);

    const layout = PanelStorage.loadCurrentLayout();
    expect(layout).not.toBeNull();
    expect(layout?.layoutType).toBe(layoutType);
    expect(layout?.panels).toHaveLength(1);
    expect(layout?.createdAt).toBeDefined();
  });

  it('clears the active layout when requested', () => {
    PanelStorage.saveCurrentLayout(samplePanels, layoutType);
    PanelStorage.clearCurrentLayout();

    expect(PanelStorage.loadCurrentLayout()).toBeNull();
  });

  it('handles corrupt current layouts safely', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('app-monitor-panel-layout', '{not json');

    expect(PanelStorage.loadCurrentLayout()).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('saves, lists, and loads named layouts', () => {
    PanelStorage.saveNamedLayout('primary', samplePanels, layoutType);

    const loaded = PanelStorage.loadNamedLayout('primary');
    expect(loaded).toMatchObject({
      name: 'primary',
      layoutType,
    });

    const allLayouts = PanelStorage.getAllSavedLayouts();
    expect(Object.keys(allLayouts)).toContain('primary');
  });

  it('deletes named layouts cleanly', () => {
    PanelStorage.saveNamedLayout('temporary', samplePanels, 'vertical');
    PanelStorage.deleteNamedLayout('temporary');

    expect(PanelStorage.loadNamedLayout('temporary')).toBeNull();
  });

  it('exports layouts as JSON and can re-import them', () => {
    PanelStorage.saveNamedLayout('shared', samplePanels, 'single');

    const payload = PanelStorage.exportLayout('shared');
    expect(payload).toBeTruthy();
    expect(payload).toContain('"name": "shared"');

    PanelStorage.deleteNamedLayout('shared');
    PanelStorage.importLayout(payload!);

    expect(PanelStorage.loadNamedLayout('shared')).not.toBeNull();
  });

  it('rejects invalid imports and propagates the error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => PanelStorage.importLayout('{"name": "broken"}')).toThrow('Invalid layout format');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns an empty map if saved layouts storage is corrupt', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('app-monitor-saved-layouts', '{bad');

    expect(PanelStorage.getAllSavedLayouts()).toEqual({});
    expect(errorSpy).toHaveBeenCalled();
  });
});
