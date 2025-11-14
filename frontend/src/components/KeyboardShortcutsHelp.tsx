import { useEffect } from "react";
import { X } from "lucide-react";

interface Shortcut {
  keys: string;
  description: string;
  category?: string;
}

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcuts: Shortcut[] = [
    { keys: "Ctrl+K", description: "Focus search", category: "Global" },
    { keys: "?", description: "Show keyboard shortcuts", category: "Global" },
    { keys: "Escape", description: "Close modal/Clear search", category: "Global" },
    { keys: "Ctrl+Space", description: "Pause/Resume logs", category: "Log Viewer" },
    { keys: "Ctrl+L", description: "Clear logs", category: "Log Viewer" },
    { keys: "Ctrl+S", description: "Download logs", category: "Log Viewer" },
    { keys: "Ctrl+↑", description: "Jump to top", category: "Log Viewer" },
    { keys: "Ctrl+↓", description: "Jump to bottom", category: "Log Viewer" },
    { keys: "N", description: "Toggle line numbers", category: "Log Viewer" },
    { keys: "E", description: "Toggle ERROR filter", category: "Filtering" },
    { keys: "W", description: "Toggle WARN filter", category: "Filtering" },
    { keys: "I", description: "Toggle INFO filter", category: "Filtering" },
    { keys: "D", description: "Toggle DEBUG filter", category: "Filtering" },
    { keys: "Ctrl+A", description: "Select all levels", category: "Filtering" },
    { keys: "Ctrl+Shift+A", description: "Clear all levels", category: "Filtering" },
    { keys: "Ctrl+Shift+S", description: "Select all services", category: "Filtering" },
    { keys: "Ctrl+R", description: "Refresh current view", category: "Navigation" },
  ];

  const categories = Array.from(new Set(shortcuts.map((shortcut) => shortcut.category ?? "Other")));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className="flex items-center justify-between border-b border-border/60 bg-card/80 px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight">⌨️ Keyboard Shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/60 text-muted-foreground transition hover:text-foreground"
            aria-label="Close keyboard shortcuts"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-6 px-6 py-5 sm:grid-cols-2">
          {categories.map((category) => (
            <div key={category} className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.35em] text-muted-foreground">
                {category}
              </h3>
              <div className="space-y-2">
                {shortcuts
                  .filter((shortcut) => (shortcut.category ?? "Other") === category)
                  .map((shortcut, index) => (
                    <div
                      key={`${shortcut.keys}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-sm shadow-sm"
                    >
                      <kbd className="min-w-[84px] rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-center font-mono text-[11px] uppercase tracking-[0.35em] text-muted-foreground">
                        {shortcut.keys}
                      </kbd>
                      <span className="flex-1 text-left text-sm text-foreground">{shortcut.description}</span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center border-t border-border/60 bg-card/80 px-6 py-4 text-xs text-muted-foreground">
          <span>
            Press <kbd className="rounded-md border border-border/60 bg-muted/40 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.35em]">Escape</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
