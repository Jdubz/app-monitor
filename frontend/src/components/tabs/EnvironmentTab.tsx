import { Socket } from 'socket.io-client';
import CloudPanelContainer from '../CloudPanelContainer';
import { Environment } from '../../types/log.types';

interface EnvironmentTabProps {
  socket: Socket | null;
  environments: Record<string, Environment>;
}

export function EnvironmentTab({ socket, environments }: EnvironmentTabProps) {
  return (
    <CloudPanelContainer
      socket={socket}
      environments={environments}
    />
  );
}
