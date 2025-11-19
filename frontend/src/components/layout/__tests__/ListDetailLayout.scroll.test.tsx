import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ListDetailLayout } from '../ListDetailLayout';

describe('ListDetailLayout long list handling', () => {
  it('keeps list and detail panes scrollable with many items', () => {
    const items = Array.from({ length: 40 }, (_, index) => ({ id: 'item-' + index, name: 'Item ' + index }));

    render(
      <ListDetailLayout
        filterTabs={[{ value: 'all', label: 'All', count: items.length }]}
        activeFilter="all"
        onFilterChange={() => {}}
        items={items}
        selectedItem={items[0]}
        onSelectItem={() => {}}
        renderListItem={(item) => <div>{item.name}</div>}
        renderDetail={(item) => <div>{item?.name ?? 'None'}</div>}
        getItemKey={(item) => item.id}
      />
    );

    const scrollRegion = screen.getByTestId('list-scroll-region');
    expect(scrollRegion).toHaveClass('overflow-y-auto');
    expect(screen.getAllByTestId('list-detail-item')).toHaveLength(items.length);

    const detailRegion = screen.getByTestId('detail-scroll-region');
    expect(detailRegion).toHaveClass('overflow-y-auto');
  });
});
