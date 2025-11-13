import { Socket } from 'socket.io-client';
import { DevBotsPanel } from '../DevBotsPanel';
import { DevBotsLayout } from '../dev-bots/DevBotsLayout';
import { ErrorBoundary } from '../common';

interface DevBotsTabProps {
  socket: Socket | null;
}

export function DevBotsTab({ socket }: DevBotsTabProps) {
  const enableNewLayout =
    (import.meta.env.VITE_FEATURE_DEV_BOTS_LAYOUT ?? 'true').toString().toLowerCase() !== 'false';

  if (enableNewLayout) {
    return (
      <ErrorBoundary>
        <DevBotsLayout socket={socket} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <DevBotsPanel socket={socket} />
    </ErrorBoundary>
  );
}
