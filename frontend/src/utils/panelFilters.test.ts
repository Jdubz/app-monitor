import { describe, it, expect } from 'vitest';

import {
  filterLogs,
  getServiceDisplayName,
  getSourceDisplayName,
  getUniqueServices,
  PanelFilterConfig,
  sourceToServices,
} from './panelFilters';
import type { DevMonitorLogLine, LogSource } from '../types/shared.types';

const baseConfig: PanelFilterConfig = {
  source: 'local-all',
  selectedServices: [],
  selectedLevels: ['INFO', 'WARN', 'ERROR', 'DEBUG'],
  searchText: '',
  paused: false,
};

const sampleLogs: DevMonitorLogLine[] = [
  {
    id: 'log-1',
    timestamp: 1,
    level: 'INFO',
    service: 'frontend-dev',
    message: 'Frontend ready',
  },
  {
    id: 'log-2',
    timestamp: 2,
    level: 'ERROR',
    service: 'dev-monitor-backend',
    message: 'Unable to bind port',
  },
  {
    id: 'log-3',
    timestamp: 3,
    level: 'DEBUG',
    service: 'job-finder-worker',
    message: 'Polling queue',
  },
  {
    id: 'log-4',
    timestamp: 4,
    level: 'WARN',
    service: 'firebase-emulators',
    message: 'Auth emulator slow',
  },
  {
    id: 'log-5',
    timestamp: 5,
    level: 'INFO',
    service: 'cloud-worker',
    message: 'Remote event',
  },
];

describe('sourceToServices', () => {
  it('maps known sources to the expected local services', () => {
    expect(sourceToServices('local-all')).toEqual([
      'firebase-emulators',
      'frontend-dev',
      'job-finder-worker',
      'dev-monitor-backend',
    ]);
    expect(sourceToServices('local-worker')).toEqual(['job-finder-worker']);
  });

  it('returns an empty array for unknown or cloud sources', () => {
    expect(sourceToServices('staging-all')).toEqual([]);
    expect(sourceToServices('unknown' as LogSource)).toEqual([]);
  });
});

describe('filterLogs', () => {
  it('applies the source mapping before any additional filters', () => {
    const filtered = filterLogs(sampleLogs, baseConfig);
    expect(filtered.map(log => log.id)).toEqual(['log-1', 'log-2', 'log-3', 'log-4']);
    expect(filtered.find(log => log.service === 'cloud-worker')).toBeUndefined();
  });

  it('respects selected services, log levels, and search text', () => {
    const config: PanelFilterConfig = {
      ...baseConfig,
      selectedServices: ['dev-monitor-backend'],
      selectedLevels: ['ERROR'],
      searchText: 'bind port',
    };

    const filtered = filterLogs(sampleLogs, config);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ id: 'log-2', service: 'dev-monitor-backend' });
  });

  it('returns an empty list for cloud-only sources handled elsewhere', () => {
    const config: PanelFilterConfig = {
      ...baseConfig,
      source: 'staging-all',
    };

    expect(filterLogs(sampleLogs, config)).toEqual([]);
  });
});

describe('display helpers', () => {
  it('deduplicates and sorts service names', () => {
    expect(getUniqueServices(sampleLogs)).toEqual([
      'cloud-worker',
      'dev-monitor-backend',
      'firebase-emulators',
      'frontend-dev',
      'job-finder-worker',
    ]);
  });

  it('returns user-friendly names for known services and sources', () => {
    expect(getServiceDisplayName('frontend-dev')).toBe('Frontend Dev');
    expect(getServiceDisplayName('unknown-service')).toBe('unknown-service');
    expect(getSourceDisplayName('local-backend')).toBe('Local - Backend');
    expect(getSourceDisplayName('custom-source')).toBe('custom-source');
  });
});
