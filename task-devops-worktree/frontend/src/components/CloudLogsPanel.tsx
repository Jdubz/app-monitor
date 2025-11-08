import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Trash2, Search, Filter } from 'lucide-react';
import { Socket } from 'socket.io-client';

import { useCloudLogs } from '../hooks/useCloudLogs';
import { useLogFilter } from '../hooks/useLogFilter';
import { getEnvironmentServices } from '../services/api';
import { CloudService, ParsedCloudLog, LogLevel } from '../types/log.types';
import LogLevelBadge from './LogLevelBadge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface CloudLogsPanelProps {
  socket: Socket | null;
  environment: string;
  projectId: string;
}

const LOG_LEVEL_ORDER: LogLevel[] = ['ERROR', 'WARN', 'INFO', 'DEBUG'];

const CloudLogsPanel = ({ socket, environment, projectId }: CloudLogsPanelProps) => {
  const [services, setServices] = useState<CloudService[]>([]);
  const [selectedService, setSelectedService] = useState<string>('all-functions');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('');
  const [timeRange, setTimeRange] = useState<string>('1h');
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const envServices = await getEnvironmentServices(environment);
        setServices(envServices);
      } catch (serviceError) {
        console.error('Failed to fetch services:', serviceError);
      }
    };

    fetchServices();
  }, [environment]);

  const { logs, isLoading, error, cloudLoggingStatus, refreshLogs, clearLogs } = useCloudLogs({
    socket,
    environment,
    service: selectedService,
    severity: selectedSeverity,
  });

  const {
    filteredLogs,
    selectedLevels,
    searchText,
    setSearchText,
    toggleLevel,
    selectAllLevels,
    clearAllLevels,
    clearSearch,
  } = useLogFilter<ParsedCloudLog>(logs);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filteredLogs]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const getTraceUrl = (traceId: string) => {
    if (!traceId) return null;
    const parts = traceId.split('/');
    const actualTraceId = parts[parts.length - 1];
    return `https://console.cloud.google.com/traces/list?project=${projectId}&tid=${actualTraceId}`;
  };

  const handleTimeRangeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTimeRange(e.target.value);
    // TODO: Implement time range filtering with API
  };

  const getResourceType = (resource: Record<string, unknown> | undefined): string | null => {
    if (!resource || typeof resource.type !== 'string') {
      return null;
    }

    const type = resource.type.split('/');
    return type[type.length - 1] ?? null;
  };

  const highlightText = (text: string, highlight: string) => {
    if (!highlight) return text;
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));

    return parts.map((part, index) =>
      part.toLowerCase() === highlight.toLowerCase() ? (
        <mark
          key={`${part}-${index}`}
          className="rounded bg-primary/30 px-1 text-primary-foreground"
        >
          {part}
        </mark>
      ) : (
        <span key={`${part}-${index}`}>{part}</span>
      ),
    );
  };

  const renderLogLine = (log: ParsedCloudLog) => {
    const resourceType = getResourceType(log.metadata.resource);

    return (
      <div
        key={log.id}
        className="rounded-lg border border-border/40 bg-muted/10 p-4 text-sm text-muted-foreground shadow-sm"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-1 items-start gap-3">
            <span className="min-w-[90px] font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70">
              {formatTimestamp(log.timestamp)}
            </span>
            <LogLevelBadge level={log.level} />
            <p className="flex-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
              {searchText ? highlightText(log.message, searchText) : log.message}
            </p>
          </div>
          {log.metadata?.insertId && (
            <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.2em]">
              {log.metadata.insertId}
            </Badge>
          )}
        </div>

        {(log.metadata.trace ||
          log.metadata.spanId ||
          log.metadata.severity ||
          resourceType ||
          log.metadata.logName) && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-muted-foreground/80">
            {log.metadata.trace && (
              <span>
                Trace:{' '}
                <a
                  href={getTraceUrl(log.metadata.trace) || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {log.metadata.trace.split('/').pop()?.substring(0, 8)}...
                </a>
              </span>
            )}
            {log.metadata.spanId && <span>Span: {log.metadata.spanId}</span>}
            {log.metadata.severity && <span>Severity: {log.metadata.severity}</span>}
            {resourceType && <span>Resource: {resourceType}</span>}
            {log.metadata.logName && <span>Stream: {log.metadata.logName.split('/').pop()}</span>}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="flex h-full flex-col border border-border/60 bg-card/70 text-foreground shadow-xl">
      <CardHeader className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <CardTitle className="text-xl font-semibold tracking-tight">
            {environment.toUpperCase()} Cloud Logs
          </CardTitle>
          <CardDescription className="text-xs uppercase tracking-[0.3em] text-muted-foreground/80">
            Project: {projectId}
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {cloudLoggingStatus && (
            <Badge
              variant={cloudLoggingStatus.available ? 'success' : 'destructive'}
              className="gap-1 text-[11px]"
            >
              <Filter className="h-3 w-3" />
              {cloudLoggingStatus.available ? 'Connected' : 'Unavailable'}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshLogs()}
            disabled={isLoading}
            className="border-primary/40 bg-primary/10 text-primary-foreground hover:bg-primary/20"
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button variant="destructive" size="sm" onClick={clearLogs} className="gap-1">
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Service
            </label>
            <select
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all-functions">All Functions</option>
              {services.map((service) => (
                <option key={service.name} value={service.name}>
                  {service.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Severity
            </label>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All Severities</option>
              {LOG_LEVEL_ORDER.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Time Range
            </label>
            <select
              value={timeRange}
              onChange={handleTimeRangeChange}
              className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="15m">Last 15 minutes</option>
              <option value="1h">Last 1 hour</option>
              <option value="6h">Last 6 hours</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Search Logs
            </label>
            <div className="flex gap-2">
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Message contains..."
                className="bg-background/80 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearSearch}
                disabled={!searchText}
              >
                <Search className="mr-1 h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {LOG_LEVEL_ORDER.map((level) => {
              const isActive = selectedLevels.includes(level);
              return (
                <Button
                  key={level}
                  type="button"
                  variant={isActive ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => toggleLevel(level)}
                  className={cn(
                    'font-mono text-[10px] uppercase tracking-[0.3em]',
                    !isActive && 'text-muted-foreground',
                  )}
                >
                  {level}
                </Button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={selectAllLevels}>
              Enable All
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={clearAllLevels}>
              Disable All
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <ScrollArea className="flex-1 rounded-md border border-border/60 bg-background/60 p-4">
          <div className="flex flex-col gap-3">
            {isLoading && (
              <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                Loading latest logs…
              </div>
            )}

            {!isLoading && filteredLogs.length === 0 ? (
              <div className="rounded-md border border-border/60 bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
                No logs match the current filters.
              </div>
            ) : (
              filteredLogs.map(renderLogLine)
            )}

            <div ref={logsEndRef} />
          </div>
        </ScrollArea>

        <Separator className="opacity-50" />

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground/80">
          <span>
            Showing{' '}
            <strong className="text-foreground">
              {filteredLogs.length}
            </strong>{' '}
            log{filteredLogs.length === 1 ? '' : 's'}
          </span>
          <span>
            Filters:{' '}
            {selectedLevels.length === LOG_LEVEL_ORDER.length
              ? 'All levels'
              : selectedLevels.join(', ') || 'None'}
            {selectedSeverity && ` • Severity: ${selectedSeverity}`}
            {selectedService && ` • Service: ${selectedService}`}
            {searchText && ` • Search: "${searchText}"`}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default CloudLogsPanel;
