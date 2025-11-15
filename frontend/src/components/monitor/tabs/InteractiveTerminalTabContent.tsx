import { InteractiveSessionTab } from '@/components/dev-bots/interactive/InteractiveSessionTab';

/**
 * InteractiveTerminalTabContent - Wrapper around InteractiveSessionTab
 *
 * Simple wrapper component to integrate the existing interactive session
 * functionality into the monitor shell tab structure.
 */
export function InteractiveTerminalTabContent() {
  return (
    <div className="h-full">
      <InteractiveSessionTab />
    </div>
  );
}
