import { ProcessInfo } from '../types/service.types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StatusBadgeStatus = ProcessInfo['status'] | 'busy';

interface StatusBadgeProps {
  status: StatusBadgeStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getStatusConfig = (): {
    variant: 'success' | 'destructive' | 'warning' | 'info' | 'outline';
    text: string;
    pulse: boolean;
  } => {
    switch (status) {
      case 'running':
        return { variant: 'success', text: '● Running', pulse: false };
      case 'stopped':
        return { variant: 'destructive', text: '○ Stopped', pulse: false };
      case 'busy':
        return { variant: 'warning', text: '● Busy', pulse: false };
      case 'starting':
        return { variant: 'warning', text: '◐ Starting...', pulse: true };
      case 'stopping':
        return { variant: 'warning', text: '◑ Stopping...', pulse: true };
      case 'error':
        return { variant: 'destructive', text: '✕ Error', pulse: false };
      default:
        return { variant: 'outline', text: status, pulse: false };
    }
  };

  const { variant, text, pulse } = getStatusConfig();

  return (
    <Badge
      variant={variant}
      className={cn(
        'font-mono text-xs tracking-[0.3em] uppercase',
        pulse && 'animate-pulse',
        variant === 'outline' && 'bg-background/40 text-muted-foreground',
      )}
    >
      {text}
    </Badge>
  );
};

export default StatusBadge;
