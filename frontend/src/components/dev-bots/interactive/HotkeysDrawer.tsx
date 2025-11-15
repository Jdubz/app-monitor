import { useCallback, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { createLogger } from '@/utils/logger';

const log = createLogger('HotkeysDrawer');

type HotkeyId = "interrupt" | "clear-terminal" | "clear-line" | "delete-word";

interface HotkeyRow {
  id: HotkeyId;
  keys: string;
  description: string;
}

const HOTKEYS: HotkeyRow[] = [
  { id: "interrupt", keys: "Esc / Ctrl + C", description: "Send interrupt signal" },
  { id: "clear-terminal", keys: "Ctrl + L", description: "Clear terminal buffer" },
  { id: "clear-line", keys: "Ctrl + U", description: "Clear current input line" },
  { id: "delete-word", keys: "Ctrl + W", description: "Delete previous word" },
];

interface HotkeysDrawerProps {
  disabled?: boolean;
  onInterrupt?: () => void | Promise<void>;
  onClearTerminal?: () => void | Promise<void>;
  onClearLine?: () => void | Promise<void>;
  onDeleteWord?: () => void | Promise<void>;
}

export function HotkeysDrawer({
  disabled,
  onInterrupt,
  onClearTerminal,
  onClearLine,
  onDeleteWord,
}: HotkeysDrawerProps) {
  const [open, setOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<HotkeyId | null>(null);

  const actionHandlers = useMemo(() => {
    return {
      interrupt: onInterrupt,
      "clear-terminal": onClearTerminal,
      "clear-line": onClearLine,
      "delete-word": onDeleteWord,
    } satisfies Record<HotkeyId, (() => void | Promise<void>) | undefined>;
  }, [onClearLine, onClearTerminal, onDeleteWord, onInterrupt]);

  const handleAction = useCallback(
    async (id: HotkeyId) => {
      if (disabled) {
        return;
      }
      const handler = actionHandlers[id];
      if (!handler) {
        return;
      }
      setPendingAction(id);
      try {
        await handler();
      } catch (error: unknown) {
        log.error('Hotkey action failed', { error, hotkeyId: id });
      } finally {
        setPendingAction(null);
      }
    },
    [actionHandlers, disabled],
  );

  return (
    <Collapsible
      className="rounded-xl border border-border/60 bg-card/80 p-3"
      open={open}
      onOpenChange={setOpen}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Terminal Hotkeys</p>
          <p className="text-xs text-muted-foreground">
            Match the dev-bot CLI ergonomics for quick investigation.
          </p>
        </div>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2 text-xs uppercase tracking-[0.3em]"
            aria-expanded={open}
          >
            {open ? "Hide" : "Show"}
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </Button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="mt-3 space-y-2">
        {HOTKEYS.map((hotkey) => {
          const handler = actionHandlers[hotkey.id];
          const busy = pendingAction === hotkey.id;
          const buttonDisabled = disabled || !handler || busy;
          return (
            <div
              key={hotkey.id}
              className="flex items-center justify-between rounded-lg border border-border/50 bg-background/80 px-3 py-2 text-sm shadow-sm"
            >
              <div className="flex flex-col">
                <span className="font-mono text-xs uppercase tracking-[0.4em] text-muted-foreground">
                  {hotkey.keys}
                </span>
                <span className="text-sm text-foreground">{hotkey.description}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={buttonDisabled}
                onClick={() => {
                  void handleAction(hotkey.id);
                }}
              >
                {busy ? "Running…" : handler ? "Trigger" : "Unavailable"}
              </Button>
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
