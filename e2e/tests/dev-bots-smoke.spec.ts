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
  maxWorkers: 2,
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

test.describe('Dev Bots Infrastructure Tab', () => {
  test.beforeEach(async ({ page }) => {
    await mockDevBotsApi(page);
    await page.goto('/');
    await authenticate(page);
    await page.getByRole('tab', { name: /Dev-Bots/i }).click();
    await page.waitForTimeout(500); // Give time for tab content to load
  });

  test('shows infrastructure overview with system status', async ({ page }) => {
    // Verify the Dev-Bots tab is active
    await expect(page.getByRole('tab', { name: /Dev-Bots/i })).toHaveAttribute('aria-selected', 'true');

    // Check for the active tabpanel
    await expect(page.getByRole('tabpanel', { name: /Dev-Bots/i })).toBeVisible();

    // Verify infrastructure overview card is visible
    await expect(page.getByText('Dev-Bots Infrastructure')).toBeVisible();
    await expect(page.getByText('Container health, agent status, and system configuration')).toBeVisible();

    // Verify system metrics are displayed
    await expect(page.getByText('System Status')).toBeVisible();
    await expect(page.getByText('running', { exact: false })).toBeVisible();

    await expect(page.getByText('Active Workers')).toBeVisible();
    await expect(page.getByText('2 / 2')).toBeVisible(); // workerCount / maxWorkers

    await expect(page.getByText('Active Tasks')).toBeVisible();
    await expect(page.getByText('1', { exact: true })).toBeVisible(); // activeTasks count

    await expect(page.getByText('Uptime')).toBeVisible();
  });

  test('shows configuration settings', async ({ page }) => {
    // Verify configuration card
    await expect(page.getByText('Configuration')).toBeVisible();
    await expect(page.getByText('Max Workers:')).toBeVisible();
    await expect(page.getByText('2', { exact: true })).toBeVisible();
  });

  test('shows worker status list', async ({ page }) => {
    // Verify worker status section
    await expect(page.getByText('Worker Status')).toBeVisible();
    await expect(page.getByText('2 workers active')).toBeVisible();

    // Verify workers are listed
    await expect(page.getByText('worker-alpha')).toBeVisible();
    await expect(page.getByText('worker-beta')).toBeVisible();

    // Verify worker statuses
    await expect(page.getByText('busy')).toBeVisible();
    await expect(page.getByText('idle')).toBeVisible();

    // Verify current task is shown for busy worker
    await expect(page.getByText('Current Task:')).toBeVisible();
    await expect(page.getByText('task-001')).toBeVisible();
  });

  test('opens settings dialog when settings button clicked', async ({ page }) => {
    // Click settings button
    await page.getByRole('button', { name: /Settings/i }).click();

    // Verify dialog opens
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Dev-Bots Settings')).toBeVisible();
    await expect(page.getByText('Configure system-wide settings for the dev-bots infrastructure.')).toBeVisible();

    // Verify max workers input is present
    await expect(page.getByLabel('Maximum Workers')).toBeVisible();
    await expect(page.getByText('Maximum number of concurrent dev-bot workers (1-20)')).toBeVisible();
  });

  test('can refresh worker status', async ({ page }) => {
    // Find and click refresh button
    const refreshButton = page.getByRole('button', { name: /Refresh/i });
    await expect(refreshButton).toBeVisible();
    await refreshButton.click();

    // Note: In a real test, we'd verify the API was called again
    // For now, just verify the button works without errors
  });

  test.skip('captures layout screenshot', async ({ page }) => {
    await disableAnimations(page);
    const screenshot = await page.screenshot({
      animations: 'disabled',
      mask: [],
      fullPage: false,
    });
    expect(screenshot).toMatchSnapshot('dev-bots-infrastructure.png');
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
