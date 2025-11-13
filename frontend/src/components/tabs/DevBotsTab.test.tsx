import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DevBotsTab } from './DevBotsTab';

const mockDevBotsPanel = vi.fn();
const mockDevBotsLayout = vi.fn();
const mockErrorDisplay = vi.fn();
const recordedBoundaries: Array<{ fallback: (error: Error, reset: () => void) => ReactNode }> = [];

vi.mock('../DevBotsPanel', () => ({
  DevBotsPanel: (props: unknown) => mockDevBotsPanel(props),
}));

vi.mock('../dev-bots/DevBotsLayout', () => ({
  DevBotsLayout: (props: unknown) => mockDevBotsLayout(props),
}));

vi.mock('../common', () => ({
  ErrorBoundary: ({
    fallback,
    children,
  }: {
    fallback: (error: Error, reset: () => void) => ReactNode;
    children: ReactNode;
  }) => {
    recordedBoundaries.push({ fallback });
    return <>{children}</>;
  },
  ErrorDisplay: (props: Record<string, unknown>) => mockErrorDisplay(props),
}));

const buildFallbackNode = (message: string) => {
  const boundary = recordedBoundaries.at(-1);
  if (!boundary) {
    throw new Error('No ErrorBoundary instance was recorded.');
  }
  const reset = vi.fn();
  return boundary.fallback(new Error(message), reset) as ReactElement;
};

describe('DevBotsTab', () => {
  beforeEach(() => {
    recordedBoundaries.length = 0;
    mockDevBotsPanel.mockImplementation(() => <div data-testid="dev-bots-panel" />);
    mockDevBotsLayout.mockImplementation(() => <div data-testid="dev-bots-layout" />);
    mockErrorDisplay.mockImplementation((props: Record<string, unknown>) => (
      <div
        data-testid="dev-bots-error-display"
        data-title={props.title as string}
        data-show-details={String(props.showDetails)}
        data-full-screen={String(props.fullScreen)}
        data-has-retry={typeof props.onRetry === 'function'}
        data-error-message={
          props.error instanceof Error ? (props.error as Error).message : String(props.error)
        }
      >
        {props.title as string}
      </div>
    ));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('wraps DevBotsPanel with an inline error fallback configuration', () => {
    vi.stubEnv('VITE_FEATURE_DEV_BOTS_LAYOUT', 'false');

    const { unmount } = render(<DevBotsTab socket={null} />);

    expect(mockDevBotsPanel).toHaveBeenCalledTimes(1);
    expect(mockDevBotsLayout).not.toHaveBeenCalled();
    expect(recordedBoundaries).toHaveLength(1);

    const node = buildFallbackNode('Panel crash');
    expect(node.props.className).toContain('py-4');
    unmount();

    const { getByTestId, unmount: unmountFallback } = render(node);
    const fallbackDisplay = getByTestId('dev-bots-error-display');
    expect(fallbackDisplay.dataset.title).toBe('Dev-Bots Panel Error');
    expect(fallbackDisplay.dataset.errorMessage).toBe('Panel crash');
    expect(fallbackDisplay.dataset.showDetails).toBe('true');
    expect(fallbackDisplay.dataset.fullScreen).toBe('false');
    expect(fallbackDisplay.dataset.hasRetry).toBe('true');
    unmountFallback();
  });

  it('wraps DevBotsLayout with an inline error fallback configuration', () => {
    vi.stubEnv('VITE_FEATURE_DEV_BOTS_LAYOUT', 'true');

    const { unmount } = render(<DevBotsTab socket={null} />);

    expect(mockDevBotsLayout).toHaveBeenCalledTimes(1);
    expect(mockDevBotsPanel).not.toHaveBeenCalled();
    expect(recordedBoundaries).toHaveLength(1);

    const node = buildFallbackNode('Layout crash');
    expect(node.props.className).toContain('py-4');
    unmount();

    const { getByTestId, unmount: unmountFallback } = render(node);
    const fallbackDisplay = getByTestId('dev-bots-error-display');
    expect(fallbackDisplay.dataset.title).toBe('Dev-Bots Layout Error');
    expect(fallbackDisplay.dataset.errorMessage).toBe('Layout crash');
    expect(fallbackDisplay.dataset.showDetails).toBe('true');
    expect(fallbackDisplay.dataset.fullScreen).toBe('false');
    expect(fallbackDisplay.dataset.hasRetry).toBe('true');
    unmountFallback();
  });
});
