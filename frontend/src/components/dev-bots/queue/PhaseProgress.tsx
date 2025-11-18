import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PhaseProgressBarProps {
  currentPhase: number;
  className?: string;
}

const PHASE_NAMES = {
  1: 'Planning',
  2: 'Implementation',
  3: 'Review',
  4: 'Fixes',
  5: 'Test & Validate',
  6: 'Cleanup',
  7: 'PR Shepherding',
};

export function PhaseProgressBar({ currentPhase, className }: PhaseProgressBarProps) {
  const phases = [1, 2, 3, 4, 5, 6, 7];
  
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {phases.map((phase) => (
        <div
          key={phase}
          className={cn(
            'h-1.5 flex-1 rounded-full transition-colors',
            phase < currentPhase && 'bg-emerald-500',
            phase === currentPhase && 'bg-primary',
            phase > currentPhase && 'bg-muted',
          )}
          title={`Phase ${phase}: ${PHASE_NAMES[phase as keyof typeof PHASE_NAMES]}`}
        />
      ))}
    </div>
  );
}

interface PhaseBadgeProps {
  phaseIndex: number;
  phaseName: string;
  phaseStatus?: string;
  phaseAttempts?: number;
  className?: string;
}

export function PhaseBadge({ phaseIndex, phaseName, phaseStatus, phaseAttempts, className }: PhaseBadgeProps) {
  const statusColors = {
    ready: 'text-slate-500',
    running: 'text-blue-500',
    validating: 'text-amber-500',
    recovering: 'text-yellow-500',
    complete: 'text-emerald-500',
    blocked: 'text-destructive',
  };

  const statusColor = phaseStatus ? statusColors[phaseStatus as keyof typeof statusColors] : 'text-muted-foreground';

  return (
    <div className={cn('flex items-center gap-2 text-xs', className)}>
      <span className="font-semibold">
        Phase {phaseIndex}/7
      </span>
      <span className="text-muted-foreground">•</span>
      <span className={cn('font-medium', statusColor)}>
        {phaseName}
      </span>
      {phaseStatus && phaseStatus !== 'ready' && (
        <>
          <span className="text-muted-foreground">•</span>
          <span className={cn('text-[10px] uppercase tracking-wide', statusColor)}>
            {phaseStatus}
          </span>
        </>
      )}
      {phaseAttempts && phaseAttempts > 1 && (
        <span className={cn(
          'flex items-center gap-1',
          phaseAttempts >= 3 ? 'text-amber-500' : 'text-muted-foreground'
        )}>
          {phaseAttempts >= 3 && <AlertCircle className="h-3 w-3" />}
          Attempt {phaseAttempts}/4
        </span>
      )}
    </div>
  );
}
