import { memo } from 'react';
import { LogLine as LogLineType } from '../types/log.types';
import LogLevelBadge from './LogLevelBadge';
import { cn } from '@/lib/utils';

interface LogLineProps {
  log: LogLineType;
  searchText?: string;
  showMetadata?: boolean;
}

const SERVICE_SWATCHES: Record<string, string> = {
  'firebase-emulators': 'text-orange-300',
  'frontend-dev': 'text-sky-300',
  'job-finder-worker': 'text-emerald-300',
  'dev-monitor-backend': 'text-cyan-300',
  all: 'text-muted-foreground',
};

const levelColors: Record<string, string> = {
  ERROR: 'text-rose-200',
  WARN: 'text-amber-200',
  INFO: 'text-cyan-100',
  DEBUG: 'text-slate-300',
};

const LogLine: React.FC<LogLineProps> = memo(({ log, searchText, showMetadata = true }) => {
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
  };

  const highlightText = (text: string, highlight?: string) => {
    if (!highlight) return text;
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return parts.map((part, index) =>
      part.toLowerCase() === highlight.toLowerCase() ? (
        <mark
          key={`${part}-${index}`}
          className="rounded bg-primary/30 px-0.5 text-primary-foreground"
        >
          {part}
        </mark>
      ) : (
        <span key={`${part}-${index}`}>{part}</span>
      ),
    );
  };

  const messageClass = levelColors[log.level] ?? 'text-slate-200';
  const serviceColor = SERVICE_SWATCHES[log.service] ?? 'text-muted-foreground';

  if (!showMetadata) {
    return (
      <div className="flex w-full items-start justify-between gap-3 px-2 py-1 text-[13px] leading-relaxed">
        <span className={cn('flex-1 whitespace-pre-wrap text-slate-200', messageClass)}>
          {highlightText(log.message, searchText)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex w-full items-start gap-4 px-2 py-1 text-[13px] leading-relaxed">
      <span className="w-24 flex-shrink-0 font-sans text-[11px] uppercase tracking-[0.3em] text-muted-foreground/60">
        {formatTimestamp(log.timestamp)}
      </span>
      <span
        className={cn(
          'w-40 flex-shrink-0 truncate font-semibold uppercase tracking-[0.25em]',
          serviceColor,
        )}
        title={log.service}
      >
        {log.service}
      </span>
      <LogLevelBadge level={log.level} />
      <span className={cn('flex-1 whitespace-pre-wrap', messageClass)}>
        {highlightText(log.message, searchText)}
      </span>
    </div>
  );
});

LogLine.displayName = 'LogLine';

export default LogLine;
