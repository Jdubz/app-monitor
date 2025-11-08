import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useLogFilter } from './useLogFilter';

const sampleLogs = [
  {
    id: 'log-a',
    timestamp: 1,
    level: 'INFO' as const,
    service: 'frontend-dev',
    message: 'Frontend boot complete',
  },
  {
    id: 'log-b',
    timestamp: 2,
    level: 'ERROR' as const,
    service: 'dev-monitor-backend',
    message: 'Failed to bind port 5050',
  },
  {
    id: 'log-c',
    timestamp: 3,
    level: 'WARN' as const,
    service: 'frontend-dev',
    message: 'High memory usage detected',
  },
] as const;

describe('useLogFilter', () => {
  it('tracks available services and filters by service and level toggles', () => {
    const { result } = renderHook(() => useLogFilter([...sampleLogs]));

    expect(result.current.filteredLogs).toHaveLength(3);
    expect(result.current.availableServices).toEqual([
      'dev-monitor-backend',
      'frontend-dev',
    ]);
    expect(result.current.selectedServices).toEqual([]);
    expect(result.current.selectedLevels).toEqual(['INFO', 'WARN', 'ERROR', 'DEBUG']);

    act(() => result.current.toggleService('frontend-dev'));
    expect(result.current.selectedServices).toEqual(['frontend-dev']);
    expect(result.current.filteredLogs.every(log => log.service === 'frontend-dev')).toBe(true);

    act(() => result.current.toggleService('frontend-dev'));
    expect(result.current.selectedServices).toEqual([]);

    act(() => result.current.selectAllServices());
    expect(result.current.selectedServices).toEqual([]);

    act(() => result.current.toggleLevel('INFO'));
    expect(result.current.selectedLevels).not.toContain('INFO');

    act(() => result.current.toggleLevel('ERROR'));
    expect(result.current.filteredLogs.every(log => log.level !== 'INFO' && log.level !== 'ERROR')).toBe(
      true,
    );

    act(() => result.current.clearAllLevels());
    expect(result.current.selectedLevels).toEqual([]);
    expect(result.current.filteredLogs).toEqual([]);

    act(() => result.current.selectAllLevels());
    expect(result.current.selectedLevels).toEqual(['INFO', 'WARN', 'ERROR', 'DEBUG']);
  });

  it('filters by search text and can reset all filters', () => {
    const { result } = renderHook(() => useLogFilter([...sampleLogs]));

    act(() => result.current.setSearchText('bind PORT'));
    expect(result.current.filteredLogs).toHaveLength(1);
    expect(result.current.filteredLogs[0].id).toBe('log-b');

    act(() => result.current.clearSearch());
    expect(result.current.searchText).toBe('');
    expect(result.current.filteredLogs).toHaveLength(3);

    act(() => {
      result.current.toggleService('dev-monitor-backend');
      result.current.toggleLevel('INFO');
      result.current.setSearchText('bind');
    });
    expect(result.current.filteredLogs).toHaveLength(1);

    act(() => result.current.resetFilters());
    expect(result.current.selectedServices).toEqual([]);
    expect(result.current.selectedLevels).toEqual(['INFO', 'WARN', 'ERROR', 'DEBUG']);
    expect(result.current.searchText).toBe('');
    expect(result.current.filteredLogs).toHaveLength(3);
  });
});
