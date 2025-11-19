import { useState, useMemo } from 'react';
import { FileText, CheckCircle2, Clock, AlertCircle, XCircle } from 'lucide-react';
import { ListDetailLayout } from '@/components/layout/ListDetailLayout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface Plan {
  id: string;
  title: string;
  type: 'feature' | 'refactor' | 'fix' | 'investigation';
  status: 'planning' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  priority: 'p0' | 'p1' | 'p2' | 'p3';
  owner: string;
  createdAt: string;
  updatedAt: string;
  estimatedEffort: string;
  progress: number;
  milestones: {
    total: number;
    completed: number;
  };
  tags: string[];
}

type PlanFilter = 'all' | 'active' | 'blocked' | 'completed';

// Stub data for demonstration
const STUB_PLANS: Plan[] = [
  {
    id: 'plan-1',
    title: 'Implement real-time monitoring dashboard',
    type: 'feature',
    status: 'in_progress',
    priority: 'p0',
    owner: 'dev-bot-alpha',
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    estimatedEffort: '3 days',
    progress: 65,
    milestones: { total: 5, completed: 3 },
    tags: ['monitoring', 'frontend', 'websockets'],
  },
  {
    id: 'plan-2',
    title: 'Refactor authentication system',
    type: 'refactor',
    status: 'planning',
    priority: 'p1',
    owner: 'dev-bot-beta',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 7200000).toISOString(),
    estimatedEffort: '5 days',
    progress: 10,
    milestones: { total: 8, completed: 1 },
    tags: ['auth', 'security', 'backend'],
  },
  {
    id: 'plan-3',
    title: 'Fix database connection pooling issues',
    type: 'fix',
    status: 'blocked',
    priority: 'p0',
    owner: 'dev-bot-gamma',
    createdAt: new Date(Date.now() - 43200000).toISOString(),
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
    estimatedEffort: '2 days',
    progress: 40,
    milestones: { total: 4, completed: 1 },
    tags: ['database', 'performance', 'backend'],
  },
  {
    id: 'plan-4',
    title: 'Migrate to React 19',
    type: 'refactor',
    status: 'completed',
    priority: 'p2',
    owner: 'dev-bot-delta',
    createdAt: new Date(Date.now() - 604800000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    estimatedEffort: '4 days',
    progress: 100,
    milestones: { total: 6, completed: 6 },
    tags: ['frontend', 'migration', 'react'],
  },
];

/**
 * PlansTabContent - Plans system overview
 *
 * Displays active plans with:
 * - Summary metrics (active, blocked, completed)
 * - Filterable list by status
 * - Detail view with milestones and progress
 *
 * NOTE: Currently uses stub data. Connect to plans API in the future.
 */
export interface PlansTabContentProps {
  plansData?: Plan[];
}

export function PlansTabContent({ plansData = STUB_PLANS }: PlansTabContentProps) {
  const [plans] = useState<Plan[]>(plansData);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(plans[0]?.id ?? null);
  const [activeFilter, setActiveFilter] = useState<PlanFilter>('all');

  const selectedPlan = useMemo(() => {
    return plans.find((plan) => plan.id === selectedPlanId) ?? null;
  }, [plans, selectedPlanId]);

  // Filter plans
  const filteredPlans = useMemo(() => {
    switch (activeFilter) {
      case 'active':
        return plans.filter((plan) => ['planning', 'in_progress'].includes(plan.status));
      case 'blocked':
        return plans.filter((plan) => plan.status === 'blocked');
      case 'completed':
        return plans.filter((plan) => plan.status === 'completed');
      case 'all':
      default:
        return plans;
    }
  }, [plans, activeFilter]);

  // Summary cards
  const summaryCards = useMemo(() => {
    const activeCount = plans.filter((p) => ['planning', 'in_progress'].includes(p.status)).length;
    const blockedCount = plans.filter((p) => p.status === 'blocked').length;
    const completedCount = plans.filter((p) => p.status === 'completed').length;

    return [
      { label: 'Active Plans', value: activeCount, className: 'text-blue-600' },
      { label: 'Blocked', value: blockedCount, className: blockedCount > 0 ? 'text-red-600' : '' },
      { label: 'Completed', value: completedCount, className: 'text-green-600' },
    ];
  }, [plans]);

  // Filter tabs
  const filterTabs = useMemo(() => {
    const activeCount = plans.filter((p) => ['planning', 'in_progress'].includes(p.status)).length;
    const blockedCount = plans.filter((p) => p.status === 'blocked').length;
    const completedCount = plans.filter((p) => p.status === 'completed').length;

    return [
      { value: 'all' as const, label: 'All', count: plans.length },
      { value: 'active' as const, label: 'Active', count: activeCount },
      { value: 'blocked' as const, label: 'Blocked', count: blockedCount },
      { value: 'completed' as const, label: 'Completed', count: completedCount },
    ];
  }, [plans]);

  // Render list item
  const renderListItem = (plan: Plan, _isSelected: boolean) => {
    const statusIcon =
      plan.status === 'completed' ? (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      ) : plan.status === 'blocked' ? (
        <XCircle className="h-4 w-4 text-red-500" />
      ) : plan.status === 'cancelled' ? (
        <AlertCircle className="h-4 w-4 text-gray-500" />
      ) : (
        <Clock className="h-4 w-4 text-blue-500" />
      );

    const statusColor =
      plan.status === 'completed'
        ? 'text-green-600'
        : plan.status === 'blocked'
          ? 'text-red-600'
          : plan.status === 'cancelled'
            ? 'text-gray-600'
            : 'text-blue-600';

    const priorityColor =
      plan.priority === 'p0'
        ? 'border-red-500 text-red-600'
        : plan.priority === 'p1'
          ? 'border-orange-500 text-orange-600'
          : 'border-blue-500 text-blue-600';

    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          {statusIcon}
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn('text-xs uppercase', priorityColor)}>
                {plan.priority}
              </Badge>
              <Badge variant="outline" className={cn('text-xs capitalize', statusColor)}>
                {plan.status.replace('_', ' ')}
              </Badge>
              <Badge variant="default" className="text-xs capitalize">
                {plan.type}
              </Badge>
            </div>
            <p className="text-sm font-medium line-clamp-2">{plan.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>by {plan.owner}</span>
          <span>•</span>
          <span>{plan.progress}% complete</span>
          <span>•</span>
          <span>{plan.milestones.completed}/{plan.milestones.total} milestones</span>
        </div>
        {plan.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {plan.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {plan.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{plan.tags.length - 3} more
              </Badge>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render detail pane
  const renderDetail = (plan: Plan | null) => {
    if (!plan) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>No Plan Selected</CardTitle>
            <CardDescription>Select a plan from the list to view details</CardDescription>
          </CardHeader>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{plan.title}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {plan.priority}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {plan.status.replace('_', ' ')}
                </Badge>
              </div>
            </CardTitle>
            <CardDescription>Type: {plan.type}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-2">Overview</h4>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>Owner: <span className="text-foreground">{plan.owner}</span></p>
                <p>Estimated Effort: <span className="text-foreground">{plan.estimatedEffort}</span></p>
                <p>Created: {new Date(plan.createdAt).toLocaleString()}</p>
                <p>Last Updated: {new Date(plan.updatedAt).toLocaleString()}</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Progress</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Overall</span>
                  <span className="font-semibold">{plan.progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all',
                      plan.progress === 100 ? 'bg-green-500' : 'bg-blue-500'
                    )}
                    style={{ width: `${plan.progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Milestones: {plan.milestones.completed}/{plan.milestones.total}</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Tags</h4>
              {plan.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {plan.tags.map((tag) => (
                    <Badge key={tag} variant="default">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No tags</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Plan Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Detailed plan information, milestones, and task breakdowns will be displayed here once connected to the plans API.
            </p>
          </CardContent>
        </Card>

        {plan.status === 'blocked' && (
          <Card className="border-red-200 bg-red-50/50">
            <CardHeader>
              <CardTitle className="text-base text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Blocked Plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-red-600">
                This plan is currently blocked. Review blockers and take action to unblock.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div className="h-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Plans System</h2>
        <p className="text-sm text-muted-foreground">
          Monitor and track development plans (stub data)
        </p>
      </div>
      <ListDetailLayout<Plan, PlanFilter>
        summaryCards={summaryCards}
        filterTabs={filterTabs}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        items={filteredPlans}
        selectedItem={selectedPlan}
        onSelectItem={(plan) => setSelectedPlanId(plan.id)}
        renderListItem={renderListItem}
        renderDetail={renderDetail}
        getItemKey={(plan) => plan.id}
        emptyMessage="No plans found for this filter"
      />
    </div>
  );
}
