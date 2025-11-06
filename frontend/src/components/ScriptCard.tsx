import { useState } from 'react';
import { Script } from '../types/script.types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ScriptCardProps {
  script: Script;
  isRunning: boolean;
  onExecute: (scriptId: string) => void;
}

const dangerPalette: Record<NonNullable<Script['dangerLevel']>, string> = {
  safe: 'border-sky-500/40 bg-sky-500/10 text-sky-100',
  warning: 'border-amber-500/40 bg-amber-500/15 text-amber-100',
  danger: 'border-rose-500/40 bg-rose-500/15 text-rose-100',
};

export default function ScriptCard({ script, isRunning, onExecute }: ScriptCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const paletteClass = dangerPalette[script.dangerLevel ?? 'safe'];

  const handleClick = () => {
    if (script.requiresConfirmation && !showConfirm) {
      setShowConfirm(true);
      return;
    }

    onExecute(script.id);
    setShowConfirm(false);
  };

  return (
    <Card
      className={cn(
        'flex h-full flex-col border border-border/60 bg-card/70 text-foreground shadow-lg transition hover:-translate-y-1 hover:shadow-xl',
        showConfirm && paletteClass,
        isRunning && 'opacity-60',
      )}
    >
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <span className="text-2xl">{script.icon}</span>
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold tracking-tight">
            {script.displayName}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{script.description}</p>
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
          <span>{script.category}</span>
          {script.requiresConfirmation && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-amber-100">
              Confirmation
            </span>
          )}
          {isRunning && (
            <span className="rounded-full border border-sky-500/40 bg-sky-500/15 px-2 py-1 text-sky-100">
              In Progress
            </span>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex flex-col gap-3">
        {showConfirm ? (
          <div className="w-full rounded-lg border border-border/60 bg-background/60 p-3 text-xs text-muted-foreground">
            <p className="mb-3 font-semibold text-foreground">
              Are you sure? This action cannot be undone.
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="destructive"
                className="flex-1"
                onClick={handleClick}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={handleClick}
            disabled={isRunning}
            className={cn(
              'w-full justify-center gap-2',
              isRunning && 'cursor-not-allowed',
            )}
          >
            {isRunning ? '⏳ Running…' : '▶ Run Script'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
