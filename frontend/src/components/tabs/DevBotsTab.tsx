import { Socket } from 'socket.io-client';
import { DevBotsPanel } from '../DevBotsPanel';
import { DevBotsLayout } from '../dev-bots/DevBotsLayout';
import { ErrorBoundary, ErrorDisplay } from '../common';

const createDevBotsErrorFallback = (title: string) => (error: Error, reset: () => void) => (
  <div className="py-4">
    <ErrorDisplay
      error={error}
      title={title}
      onRetry={reset}
      showDetails
      fullScreen={false}
    />
  </div>
);

const renderPanelErrorFallback = createDevBotsErrorFallback('Dev-Bots Panel Error');
const renderLayoutErrorFallback = createDevBotsErrorFallback('Dev-Bots Layout Error');

interface DevBotsTabProps {
  socket: Socket | null;
}

export function DevBotsTab({ socket }: DevBotsTabProps) {
  const enableNewLayout =
    (import.meta.env.VITE_FEATURE_DEV_BOTS_LAYOUT ?? 'true').toString().toLowerCase() !== 'false';

  if (enableNewLayout) {
    return (
      <ErrorBoundary fallback={renderLayoutErrorFallback}>
        <DevBotsLayout socket={socket} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary fallback={renderPanelErrorFallback}>
      <DevBotsPanel socket={socket} />
    </ErrorBoundary>
  );
}
