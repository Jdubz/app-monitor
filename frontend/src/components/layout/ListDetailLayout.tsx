import { ReactNode, memo } from 'react';
import { DualPaneLayout } from './DualPaneLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface FilterTab<TFilter extends string> {
  value: TFilter;
  label: string;
  count?: number;
}

interface ListDetailLayoutProps<TItem, TFilter extends string> {
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
      data-testid="list-detail-item"
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
    <div className="flex h-full min-h-0 flex-col p-4">
      {/* Filter Tabs */}
      <Tabs
        value={activeFilter}
        onValueChange={onFilterChange as (value: string) => void}
        className="flex min-h-0 flex-col gap-4"
      >
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
        <TabsContent value={activeFilter} className="flex-1 overflow-hidden">
          {items.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-muted-foreground/30 p-8 text-center">
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div
                data-testid="list-scroll-region"
                className="flex-1 space-y-2 overflow-y-auto pr-1"
              >
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
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );

  const rightPane = (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div
        data-testid="detail-scroll-region"
        className="flex-1 overflow-y-auto pr-1"
      >
        {renderDetail(selectedItem)}
      </div>
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
