import { ReactNode, memo } from 'react';
import { DualPaneLayout } from './DualPaneLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface SummaryCard {
  label: string;
  value: string | number;
  className?: string;
}

interface FilterTab<TFilter extends string> {
  value: TFilter;
  label: string;
  count?: number;
}

interface ListDetailLayoutProps<TItem, TFilter extends string> {
  /**
   * Summary metric cards to display at the top
   */
  summaryCards: SummaryCard[];
  /**
   * Filter tabs for the list
   */
  filterTabs: FilterTab<TFilter>[];
  /**
   * Current active filter
   */
  activeFilter: TFilter;
  /**
   * Filter change handler
   */
  onFilterChange: (filter: TFilter) => void;
  /**
   * Array of items to display in the list
   */
  items: TItem[];
  /**
   * Currently selected item
   */
  selectedItem: TItem | null;
  /**
   * Item selection handler
   */
  onSelectItem: (item: TItem) => void;
  /**
   * Render function for each list item
   */
  renderListItem: (item: TItem, isSelected: boolean) => ReactNode;
  /**
   * Render function for the detail pane
   */
  renderDetail: (item: TItem | null) => ReactNode;
  /**
   * Get unique key for an item
   */
  getItemKey: (item: TItem) => string;
  /**
   * Optional className for the container
   */
  className?: string;
  /**
   * Optional empty state message
   */
  emptyMessage?: string;
}

/**
 * Memoized list item component to prevent unnecessary re-renders
 * Only re-renders when item key, selection state, or render function changes
 */
interface ListItemProps<TItem> {
  item: TItem;
  itemKey: string;
  isSelected: boolean;
  onSelectItem: (item: TItem) => void;
  renderListItem: (item: TItem, isSelected: boolean) => ReactNode;
}

const ListItemComponent = <TItem,>({
  item,
  isSelected,
  onSelectItem,
  renderListItem,
}: Omit<ListItemProps<TItem>, 'itemKey'>) => {
  return (
    <div
      onClick={() => onSelectItem(item)}
      className={cn(
        'cursor-pointer rounded-md border p-3 transition-colors',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border/50 hover:border-border hover:bg-accent/50'
      )}
    >
      {renderListItem(item, isSelected)}
    </div>
  );
};

// Memoize with custom comparison to prevent re-renders when props haven't changed
const MemoizedListItem = memo(
  ListItemComponent,
  (prevProps, nextProps) => {
    // Only re-render if item, selection state, or render function changed
    return (
      prevProps.item === nextProps.item &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.renderListItem === nextProps.renderListItem
    );
  }
) as typeof ListItemComponent;

/**
 * Generic list-detail layout component with TypeScript generics
 *
 * Provides a consistent interface for displaying filterable lists with detail views.
 * Uses DualPaneLayout for responsive split-screen behavior.
 *
 * @template TItem - Type of items in the list
 * @template TFilter - Union type of filter values
 */
export function ListDetailLayout<TItem, TFilter extends string>({
  summaryCards,
  filterTabs,
  activeFilter,
  onFilterChange,
  items,
  selectedItem,
  onSelectItem,
  renderListItem,
  renderDetail,
  getItemKey,
  className,
  emptyMessage = 'No items to display',
}: ListDetailLayoutProps<TItem, TFilter>) {
  const leftPane = (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Summary Cards */}
      {summaryCards.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summaryCards.map((card) => (
            <Card key={card.label} className="border-border/60 bg-card/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {card.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn('text-xl font-semibold', card.className)}>
                  {card.value}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filter Tabs */}
      <Tabs value={activeFilter} onValueChange={onFilterChange as (value: string) => void}>
        <TabsList className="w-full min-w-0 overflow-x-auto sm:snap-x">
          {filterTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex-1 min-w-[80px] sm:min-w-[100px] snap-start">
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 text-xs opacity-70">({tab.count})</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* List Content */}
        <TabsContent value={activeFilter} className="mt-4 h-full">
          {items.length === 0 ? (
            <div className="flex items-center justify-center rounded-md border border-dashed border-muted-foreground/30 p-8 text-center">
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const key = getItemKey(item);
                const isSelected = selectedItem ? getItemKey(selectedItem) === key : false;
                return (
                  <MemoizedListItem
                    key={key}
                    item={item}
                    isSelected={isSelected}
                    onSelectItem={onSelectItem}
                    renderListItem={renderListItem}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );

  const rightPane = (
    <div className="h-full p-4">
      {renderDetail(selectedItem)}
    </div>
  );

  return (
    <DualPaneLayout
      left={leftPane}
      right={rightPane}
      className={className}
    />
  );
}
