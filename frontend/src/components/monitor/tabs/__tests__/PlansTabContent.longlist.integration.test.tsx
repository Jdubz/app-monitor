import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PlansTabContent, type Plan } from '../PlansTabContent';

const makePlan = (index: number): Plan => ({
  id: 'plan-' + index,
  title: 'Plan ' + index,
  type: 'feature',
  status: index % 3 === 0 ? 'blocked' : 'in_progress',
  priority: 'p1',
  owner: 'bot-' + index,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  estimatedEffort: '2 days',
  progress: index % 100,
  milestones: { total: 5, completed: 2 },
  tags: ['tag-' + index],
});

describe('PlansTabContent long list integration', () => {
  it('renders scrollable plan list when dozens of plans exist', () => {
    const plans = Array.from({ length: 45 }, (_, index) => makePlan(index));

    render(<PlansTabContent plansData={plans} />);

    const listRegion = screen.getByTestId('list-scroll-region');
    expect(listRegion).toHaveClass('overflow-y-auto');
    expect(screen.getAllByTestId('list-detail-item')).toHaveLength(plans.length);
  });
});

