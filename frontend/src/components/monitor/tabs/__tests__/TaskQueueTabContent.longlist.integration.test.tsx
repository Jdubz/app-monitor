import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { DevBotsTask, DevBotsQueueItem } from '@/types/dev-bots';
import { TaskQueueTabContent } from '../TaskQueueTabContent';

const makeTask = (index: number, status: DevBotsTask['status']): DevBotsTask => ({
  id: 'task-' + index,
  type: 'implementation',
  description: 'Task description ' + index,
  status,
  createdAt: new Date().toISOString(),
  assignedAgent: 'claude-sonnet',
  priority: 1,
  project: 'app-monitor',
  retryCount: 0,
  maxRetries: 3,
});

const LONG_QUEUE: DevBotsQueueItem[] = Array.from({ length: 31 }, (_, index) => ({
  bucket: 'pending',
  task: makeTask(index, 'pending'),
}));

vi.mock('@/contexts/devBotsStore', () => ({
  useDevBotsStore: () => ({
    queueRows: LONG_QUEUE,
    status: { workerCount: 2, maxWorkers: 4 },
    isLoading: false,
  }),
}));

describe('TaskQueueTabContent long list integration', () => {
  it('keeps task list scrollable instead of expanding layout', async () => {
    render(<TaskQueueTabContent />);

    const listRegion = await screen.findByTestId('list-scroll-region');
    expect(listRegion).toHaveClass('overflow-y-auto');

    const items = await screen.findAllByTestId('list-detail-item');
    expect(items).toHaveLength(LONG_QUEUE.length);
  });
});
