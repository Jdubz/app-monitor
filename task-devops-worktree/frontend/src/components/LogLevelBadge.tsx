import { LogLevel } from '../types/log.types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface LogLevelBadgeProps {
  level: LogLevel;
}

const LogLevelBadge: React.FC<LogLevelBadgeProps> = ({ level }) => {
  const getVariant = (): 'destructive' | 'warning' | 'info' | 'outline' => {
    switch (level) {
      case 'ERROR':
        return 'destructive';
      case 'WARN':
        return 'warning';
      case 'INFO':
        return 'info';
      case 'DEBUG':
        return 'outline';
      default:
        return 'outline';
    }
  };

  return (
    <Badge
      variant={getVariant()}
      className={cn(
        'min-w-[48px] justify-center font-mono text-[10px] uppercase tracking-[0.3em]',
        level === 'DEBUG' && 'text-muted-foreground',
      )}
    >
      {level}
    </Badge>
  );
};

export default LogLevelBadge;
