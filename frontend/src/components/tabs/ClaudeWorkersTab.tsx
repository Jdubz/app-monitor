import { Socket } from 'socket.io-client';
import { ClaudeWorkersPanel } from '../ClaudeWorkersPanel';

interface ClaudeWorkersTabProps {
  socket: Socket | null;
}

export function ClaudeWorkersTab({ socket }: ClaudeWorkersTabProps) {
  return <ClaudeWorkersPanel socket={socket} />;
}
