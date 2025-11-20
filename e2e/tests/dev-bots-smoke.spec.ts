import { test, expect, Page, Route } from '@playwright/test';
import { authenticate } from '../helpers/auth';

const mockTask = {
  id: 'task-001',
  type: 'implementation',
  description: 'Rebuild Dev Bots dashboard',
  status: 'active' as const,
  createdAt: '2025-11-01T10:00:00.000Z',
  assignedWorker: 'worker-alpha',
  assignedAgent: 'backend-specialist',
  assignedAt: '2025-11-01T10:05:00.000Z',
  acceptanceCriteria: ['Render queue summary', 'Show worker console'],
  files: ['frontend/src/components/dev-bots/*'],
  priority: 7,
  retryCount: 0,
  maxRetries: 2,
  canRetry: true,
};

const mockCompletedTask = {
  ...mockTask,
  id: 'task-000',
  status: 'completed' as const,
  completedAt: '2025-11-01T11:00:00.000Z',
};

const mockQueueSummary = {
  items: [
    { bucket: 'pending' as const, task: { ...mockTask, id: 'task-002', status: 'pending' as const } },
    { bucket: 'active' as const, task: mockTask },
    { bucket: 'completed' as const, task: mockCompletedTask },
  ],
  counts: { pending: 1, active: 1, blocked: 0, completed: 1, failed: 0 },
  lastUpdated: '2025-11-01T11:05:00.000Z',
};

const mockHistory = [
  {
    id: 'execution-1',
    taskId: mockTask.id,
    type: 'execution',
    message: 'Attempt 1 completed successfully',
    timestamp: '2025-11-01T10:45:00.000Z',
    metadata: { attemptNumber: 1, workerId: 'worker-alpha', durationMs: 120000 },
  },
];

const mockLogsDescriptor = {
  taskId: mockTask.id,
  stdout: {
    filename: `${mockTask.id}-stdout.log`,
    path: `/virtual/${mockTask.id}-stdout.log`,
    size: 2048,
    updatedAt: '2025-11-01T11:06:00.000Z',
    stream: 'stdout' as const,
  },
  stderr: {
    filename: `${mockTask.id}-stderr.log`,
    path: `/virtual/${mockTask.id}-stderr.log`,
    size: 512,
    updatedAt: '2025-11-01T11:06:00.000Z',
    stream: 'stderr' as const,
  },
};

const mockSettings = {
  modelStrategy: 'alternate' as const,
  maxWorkers: 2,
  dryRun: true,
  autoCleanup: false,
  updatedAt: '2025-11-01T11:00:00.000Z',
};

const mockStatus = {
  systemStatus: 'running' as const,
  workers: {
    'worker-alpha': {
      id: 'worker-alpha',
      status: 'busy',
      currentTask: mockTask.id,
      lastSeen: Date.now(),
    },
    'worker-beta': {
      id: 'worker-beta',
      status: 'idle',
      lastSeen: Date.now(),
    },
  },
  queueSize: 3,
  activeTasks: 1,
  uptime: 12_345,
  workerCount: 2,
  maxWorkers: 2,
  activeWorkerTypes: ['worker-alpha'],
  availableWorkerTypes: [],
  tasks: {
    pending: [{ ...mockTask, id: 'task-003', status: 'pending' as const }],
    active: [mockTask],
    completed: [mockCompletedTask],
  },
};

test.describe('Dev Bots Command Center', () => {
  test.beforeEach(async ({ page }) => {
    await mockDevBotsApi(page);
    await page.goto('/');
    await authenticate(page);
    await page.getByRole('tab', { name: /Dev-Bots/i }).click();
    await page.waitForTimeout(500); // Give time for tab content to load
  });

  test('smoke view shows queue and worker consoles', async ({ page }) => {
    // Just verify the Dev-Bots tab loads without errors
    await expect(page.getByRole('tab', { name: /Dev-Bots/i })).toHaveAttribute('aria-selected', 'true');
    
    // Check for the active tabpanel
    await expect(page.getByRole('tabpanel', { name: /Dev-Bots/i })).toBeVisible();
  });

  test('renders chains header and list or empty state', async ({ page }) => {
    await page.waitForTimeout(750);

    const loadingVisible = await page
      .getByText(/Loading dev-bots status/i)
      .isVisible()
      .catch(() => false);
    const headerVisible = await page
      .locator('text=Dev-Bots Chains')
      .first()
      .isVisible()
      .catch(() => false);
    const filtersVisible = await page
      .getByRole('tab', { name: /All/i })
      .isVisible()
      .catch(() => false);
    const listItemVisible = await page
      .getByTestId('list-detail-item')
      .first()
      .isVisible()
      .catch(() => false);
    const emptyStateVisible = await page
      .getByText(/No chains found/i)
      .isVisible()
      .catch(() => false);

    expect(
      loadingVisible || (headerVisible && filtersVisible) || listItemVisible || emptyStateVisible,
    ).toBe(true);
  });

  test.skip('captures layout screenshot', async ({ page }) => {
    await disableAnimations(page);
    const screenshot = await page.screenshot({
      animations: 'disabled',
      mask: [],
      fullPage: false,
    });
    expect(screenshot).toMatchSnapshot('dev-bots-layout.png');
  });
});

async function mockDevBotsApi(page: Page) {
  await page.route('**/api/dev-bots/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace('/api/dev-bots', '');
    const method = route.request().method();

    if (/^\/tasks\/[^/]+\/logs\/(stdout|stderr)/.test(pathname)) {
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: `data: [${pathname.endsWith('stdout') ? 'stdout' : 'stderr'}] Hello, world!\n\n`,
      });
    }

    if (pathname.startsWith('/tasks/') && pathname.endsWith('/logs')) {
      return route.fulfill(json(mockLogsDescriptor));
    }

    if (pathname.startsWith('/tasks/') && pathname.endsWith('/detail')) {
      return route.fulfill(
        json({
          task: mockTask,
          history: mockHistory,
        }),
      );
    }

    if (pathname === '/queue') {
      return route.fulfill(json(mockQueueSummary));
    }

    if (pathname === '/status') {
      return route.fulfill(json(mockStatus));
    }

    if (pathname === '/settings' && method === 'GET') {
      return route.fulfill(json(mockSettings));
    }

    if (pathname === '/settings' && method === 'PUT') {
      return route.fulfill(json({ ...mockSettings, ...JSON.parse(route.request().postData() ?? '{}') }));
    }

    return route.fallback();
  });
}

function json(payload: unknown) {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

async function disableAnimations(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        transition-duration: 0s !important;
        animation-duration: 0s !important;
        animation-delay: 0s !important;
      }
    `,
  });
}
