import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PrTrackingTabContent, type PullRequest } from '../PrTrackingTabContent';

const makePr = (index: number): PullRequest => ({
  id: 'pr-' + index,
  number: 100 + index,
  title: 'Update module ' + index,
  status: index % 2 === 0 ? 'open' : 'merged',
  author: 'bot-' + index,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  branch: 'feature/' + index,
  checks: { passed: 5, failed: index % 5 === 0 ? 1 : 0, pending: 0 },
  reviewers: [],
  labels: ['label-' + index],
});

describe('PrTrackingTabContent long list integration', () => {
  it('keeps PR list scrollable for large datasets', () => {
    const prs = Array.from({ length: 50 }, (_, index) => makePr(index));

    render(<PrTrackingTabContent prsData={prs} />);

    const listRegion = screen.getByTestId('list-scroll-region');
    expect(listRegion).toHaveClass('overflow-y-auto');
    expect(screen.getAllByTestId('list-detail-item')).toHaveLength(prs.length);
  });
});
