import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export function Header() {
  return (
    <header className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-xl backdrop-blur-lg">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.35em] text-muted-foreground">
            <span>App Monitor</span>
            <Separator orientation="vertical" className="h-4 bg-border/70" />
            <Badge variant="info" className="px-3 py-1 text-[10px] uppercase tracking-[0.2em]">
              Night Ops
            </Badge>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Dev Console Monitor
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Command center for every work-target, service, and dev-bot in your stack.
              Monitor health, stream logs, and dispatch agents from one darkroom-ready console.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/40 px-3 py-1 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Stable
          </div>
          <Button variant="outline" size="sm">
            Launch Terminal
          </Button>
        </div>
      </div>
    </header>
  );
}
