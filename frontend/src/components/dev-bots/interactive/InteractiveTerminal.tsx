import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

import type { ConnectionState, InteractiveLogEntry } from '@/hooks/useInteractiveSession';
import { createLogger } from '@/utils/logger';

const log = createLogger('InteractiveTerminal');

interface InteractiveTerminalProps {
  logs: InteractiveLogEntry[];
  connectionState: ConnectionState;
  onData?: (chunk: string) => void;
  onInterrupt?: () => void;
  onResize?: (size: { cols: number; rows: number }) => void;
}

export function InteractiveTerminal({
  logs,
  connectionState,
  onData,
  onInterrupt,
  onResize,
}: InteractiveTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal>();
  const fitAddonRef = useRef<FitAddon>();
  const lastRenderedIndexRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const terminal = new Terminal({
      convertEol: true,
      fontFamily: 'Menlo, Monaco, Consolas, monospace',
      cursorBlink: true,
      rows: 24,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    lastRenderedIndexRef.current = 0;

    const handleResize = () => {
      try {
        fitAddon.fit();
      } catch (error) {
        log.warn('Unable to fit terminal', { error });
      }
    };

    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      if (cols && rows) {
        onResize?.({ cols, rows });
      }
    });

    const dataDisposable = terminal.onData((chunk) => {
      onData?.(chunk);
    });

    terminal.attachCustomKeyEventHandler((event) => {
      const key = event.key.toLowerCase();
      if (event.key === 'Escape' || (event.ctrlKey && key === 'c')) {
        event.preventDefault();
        onInterrupt?.();
        return false;
      }
      if (event.ctrlKey && key === 'l') {
        event.preventDefault();
        terminal.clear();
        lastRenderedIndexRef.current = 0;
        return false;
      }
      if (event.ctrlKey && key === 'u') {
        event.preventDefault();
        onData?.('\u0015');
        return false;
      }
      if (event.ctrlKey && key === 'w') {
        event.preventDefault();
        onData?.('\u0017');
        return false;
      }
      return true;
    });

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeDisposable.dispose();
      dataDisposable.dispose();
      terminal.dispose();
    };
  }, [onData, onInterrupt, onResize]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    if (logs.length < lastRenderedIndexRef.current) {
      terminal.clear();
      lastRenderedIndexRef.current = 0;
    }

    const nextEntries = logs.slice(lastRenderedIndexRef.current);
    nextEntries.forEach((entry) => {
      const prefix =
        entry.source === 'system'
          ? '[system] '
          : entry.source === 'user'
            ? '[you] '
            : '';
      terminal.writeln(`${prefix}${entry.body || ' '}`);
    });
    lastRenderedIndexRef.current = logs.length;

    try {
      fitAddonRef.current?.fit();
    } catch (error) {
      log.warn('Unable to fit terminal after update', { error });
    }
  }, [logs]);

  return (
    <div
      ref={containerRef}
      className="h-[420px] w-full rounded-lg border border-border/60 bg-background/95"
      data-connection-state={connectionState}
    />
  );
}
