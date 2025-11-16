import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DualPaneLayoutProps {
  /**
   * Left pane content (typically overview/list)
   */
  left: ReactNode;
  /**
   * Right pane content (typically detail view)
   */
  right: ReactNode;
  /**
   * Additional className for the container
   */
  className?: string;
  /**
   * Whether to render panes as cards (default: true)
   */
  asCards?: boolean;
}

/**
 * Reusable dual-pane layout component
 *
 * Provides a responsive split layout:
 * - Desktop (lg+): Side-by-side panes with 5:7 ratio
 * - Mobile: Stacked vertically
 *
 * Each pane is wrapped in a Card with ScrollArea for consistent styling.
 */
export function DualPaneLayout({
  left,
  right,
  className,
  asCards = true
}: DualPaneLayoutProps) {
  const PaneWrapper = asCards ? Card : 'div';

  return (
    <div
      className={cn(
        'grid min-w-0 gap-4 overflow-x-hidden',
        'grid-cols-1',
        'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]',
        'h-full min-h-[calc(100vh-220px)]',
        className
      )}
    >
      <PaneWrapper className={cn(asCards && 'flex min-w-0 flex-col overflow-hidden')}>
        <ScrollArea className="w-full flex-1">
          {left}
        </ScrollArea>
      </PaneWrapper>

      <PaneWrapper className={cn(asCards && 'flex min-w-0 flex-col overflow-hidden')}>
        <ScrollArea className="w-full flex-1">
          {right}
        </ScrollArea>
      </PaneWrapper>
    </div>
  );
}
