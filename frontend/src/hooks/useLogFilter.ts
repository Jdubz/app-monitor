import { useMemo, useState, useCallback } from 'react';
import { LogLevel } from '../types/log.types';

interface FilterableLog {
  service: string;
  level: LogLevel;
  message: string;
}

export const useLogFilter = <T extends FilterableLog>(logs: T[]) => {
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<LogLevel[]>(['INFO', 'WARN', 'ERROR', 'DEBUG']);
  const [searchText, setSearchText] = useState('');

  // Get unique service names from logs
  const availableServices = useMemo(() => {
    const services = new Set(logs.map(log => log.service));
    return Array.from(services).sort();
  }, [logs]);

  // Filter logs based on current filters
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Filter by service (if any selected)
      if (selectedServices.length > 0 && !selectedServices.includes(log.service)) {
        return false;
      }

      // Filter by log level
      if (!selectedLevels.includes(log.level)) {
        return false;
      }

      // Filter by search text
      if (searchText && !log.message.toLowerCase().includes(searchText.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [logs, selectedServices, selectedLevels, searchText]);

  // Toggle service filter
  const toggleService = useCallback((service: string) => {
    setSelectedServices(prev =>
      prev.includes(service)
        ? prev.filter(s => s !== service)
        : [...prev, service]
    );
  }, []);

  // Toggle level filter
  const toggleLevel = useCallback((level: LogLevel) => {
    setSelectedLevels(prev =>
      prev.includes(level)
        ? prev.filter(l => l !== level)
        : [...prev, level]
    );
  }, []);

  // Select all services
  const selectAllServices = useCallback(() => {
    setSelectedServices([]);
  }, []);

  // Select all levels
  const selectAllLevels = useCallback(() => {
    setSelectedLevels(['INFO', 'WARN', 'ERROR', 'DEBUG']);
  }, []);

  // Clear all levels
  const clearAllLevels = useCallback(() => {
    setSelectedLevels([]);
  }, []);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchText('');
  }, []);

  // Reset all filters
  const resetFilters = useCallback(() => {
    setSelectedServices([]);
    setSelectedLevels(['INFO', 'WARN', 'ERROR', 'DEBUG']);
    setSearchText('');
  }, []);

  return {
    filteredLogs,
    availableServices,
    selectedServices,
    selectedLevels,
    searchText,
    setSearchText,
    toggleService,
    toggleLevel,
    selectAllServices,
    selectAllLevels,
    clearAllLevels,
    clearSearch,
    resetFilters,
  };
};
