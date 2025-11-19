/**
 * Terminal Component - tmux-based persistent terminal
 *
 * Simple terminal component using xterm.js to connect to TerminalService.
 * Sessions persist across disconnects via tmux on the backend.
 *
 * Features:
 * - Create new terminal sessions
 * - Attach to existing sessions
 * - Sessions survive page refresh
 * - Auto-reconnect on disconnect
 */

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  socket: Socket | null;
  sessionId?: string;
  onSessionCreated?: (sessionId: string) => void;
}

export function Terminal({ socket, sessionId: initialSessionId, onSessionCreated }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  useEffect(() => {
    if (!terminalRef.current || !socket) return;

    // Initialize xterm.js
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
      },
      cols: 80,
      rows: 24,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Setup Socket.IO event handlers
    socket.on('terminal:created', ({ sessionId: newSessionId }: { sessionId: string }) => {
      setSessionId(newSessionId);
      setStatus('connected');
      onSessionCreated?.(newSessionId);
    });

    socket.on('terminal:attached', ({ sessionId: attachedSessionId }: { sessionId: string }) => {
      setSessionId(attachedSessionId);
      setStatus('connected');
    });

    socket.on('terminal:output', (data: string) => {
      term.write(data);
    });

    socket.on('terminal:closed', ({ exitCode }: { exitCode: number }) => {
      term.writeln(`\r\n\r\nSession closed with exit code ${exitCode}`);
      setStatus('disconnected');
    });

    socket.on('terminal:error', ({ message }: { message: string }) => {
      term.writeln(`\r\n\r\nError: ${message}`);
      setStatus('disconnected');
    });

    // Send input to backend
    term.onData((data) => {
      if (socket.connected) {
        socket.emit('terminal:input', data);
      }
    });

    // Handle terminal resize
    const handleResize = () => {
      fitAddon.fit();
      if (socket.connected) {
        socket.emit('terminal:resize', term.cols, term.rows);
      }
    };

    window.addEventListener('resize', handleResize);

    // Create or attach to session
    if (initialSessionId) {
      socket.emit('terminal:attach', initialSessionId);
    } else {
      socket.emit('terminal:create');
    }

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      socket.off('terminal:created');
      socket.off('terminal:attached');
      socket.off('terminal:output');
      socket.off('terminal:closed');
      socket.off('terminal:error');
      term.dispose();
    };
  }, [socket, initialSessionId, onSessionCreated]);

  return (
    <div className="terminal-container" style={{ height: '100%', width: '100%' }}>
      <div className="terminal-header" style={{
        padding: '8px 12px',
        background: '#2d2d30',
        color: '#cccccc',
        fontSize: '12px',
        borderBottom: '1px solid #3e3e42',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          {sessionId ? `Session: ${sessionId}` : 'Terminal'}
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: status === 'connected' ? '#4ec9b0' : status === 'connecting' ? '#ce9178' : '#f48771'
          }} />
          <span style={{ textTransform: 'capitalize' }}>{status}</span>
        </div>
      </div>
      <div
        ref={terminalRef}
        style={{
          height: 'calc(100% - 37px)',
          padding: '8px'
        }}
      />
    </div>
  );
}
