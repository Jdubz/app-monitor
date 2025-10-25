/**
 * Panel filtering utilities
 *
 * Maps LogSource selections to LocalService arrays for filtering
 */

import {
  LogSource,
  LocalService,
  DevMonitorLogLine,
  DevMonitorLogLevel,
} from '@jsdubzw/job-finder-shared-types';

/**
 * Map a LogSource to the services it includes
 */
export function sourceToServices(source: LogSource): LocalService[] {
  switch (source) {
    case 'local-all':
      return ['firebase-emulators', 'frontend-dev', 'python-worker', 'dev-monitor-backend'];
    case 'local-frontend':
      return ['frontend-dev'];
    case 'local-backend':
      return ['firebase-emulators'];
    case 'local-worker':
      return ['python-worker'];
    case 'local-dev-monitor':
      return ['dev-monitor-backend'];
    // Cloud sources - not applicable for local filtering
    case 'staging-all':
    case 'production-all':
      return [];
    default:
      return [];
  }
}

/**
 * Filter logs by panel configuration
 */
export interface PanelFilterConfig {
  source: LogSource;
  selectedServices: LocalService[];
  selectedLevels: DevMonitorLogLevel[];
  searchText: string;
  paused: boolean;
}

export function filterLogs(
  logs: DevMonitorLogLine[],
  config: PanelFilterConfig
): DevMonitorLogLine[] {
  // Get services for this source
  const sourceServices = sourceToServices(config.source);

  // If source is cloud-based, return empty (handled by cloud logs panel)
  if (sourceServices.length === 0) {
    return [];
  }

  return logs.filter(log => {
    // Filter by source (must be in source's service list)
    if (!sourceServices.includes(log.service)) {
      return false;
    }

    // Filter by selected services (if any specified)
    if (config.selectedServices.length > 0) {
      if (!config.selectedServices.includes(log.service)) {
        return false;
      }
    }

    // Filter by log level
    if (!config.selectedLevels.includes(log.level)) {
      return false;
    }

    // Filter by search text
    if (config.searchText) {
      const searchLower = config.searchText.toLowerCase();
      if (!log.message.toLowerCase().includes(searchLower)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Get unique services from a list of logs
 */
export function getUniqueServices(logs: DevMonitorLogLine[]): LocalService[] {
  const services = new Set<LocalService>();
  logs.forEach(log => services.add(log.service));
  return Array.from(services).sort();
}

/**
 * Get display name for a service
 */
export function getServiceDisplayName(service: LocalService): string {
  const displayNames: Record<LocalService, string> = {
    'firebase-emulators': 'Firebase Emulators',
    'frontend-dev': 'Frontend Dev',
    'python-worker': 'Python Worker',
    'dev-monitor-backend': 'Dev Monitor Backend',
    'all': 'All Services',
  };
  return displayNames[service] || service;
}

/**
 * Get display name for a log source
 */
export function getSourceDisplayName(source: LogSource): string {
  const displayNames: Record<LogSource, string> = {
    'local-all': 'Local - All Services',
    'local-frontend': 'Local - Frontend',
    'local-backend': 'Local - Backend',
    'local-worker': 'Local - Worker',
    'local-dev-monitor': 'Local - Dev Monitor',
    'staging-all': 'Staging - All',
    'production-all': 'Production - All',
  };
  return displayNames[source] || source;
}
