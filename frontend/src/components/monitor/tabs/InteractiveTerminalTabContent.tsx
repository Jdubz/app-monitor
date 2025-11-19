import type { Socket } from 'socket.io-client';
import { Terminal } from '@/components/dev-bots/Terminal';

interface InteractiveTerminalTabContentProps {
  socket: Socket | null;
}

/**
 * InteractiveTerminalTabContent - tmux-based persistent terminal
 *
 * Simple wrapper component to integrate the new Terminal component
 * into the monitor shell tab structure.
 */
export function InteractiveTerminalTabContent({ socket }: InteractiveTerminalTabContentProps) {
  return (
    <div className="h-full">
      <Terminal socket={socket} />
    </div>
  );
}
