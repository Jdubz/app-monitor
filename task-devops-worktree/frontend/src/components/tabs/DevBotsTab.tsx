import { Socket } from 'socket.io-client';
import { DevBotsPanel } from '../DevBotsPanel';

interface DevBotsTabProps {
  socket: Socket | null;
}

export function DevBotsTab({ socket }: DevBotsTabProps) {
  return <DevBotsPanel socket={socket} />;
}
