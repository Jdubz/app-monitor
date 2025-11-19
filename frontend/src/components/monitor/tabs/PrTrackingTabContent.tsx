import { useState, useMemo } from 'react';
import { GitPullRequest, CheckCircle2, AlertCircle } from 'lucide-react';
import { ListDetailLayout } from '@/components/layout/ListDetailLayout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  status: 'open' | 'merged' | 'closed';
  author: string;
  createdAt: string;
  updatedAt: string;
  branch: string;
  checks: {
    passed: number;
    failed: number;
    pending: number;
  };
  reviewers: string[];
  labels: string[];
}

type PrFilter = 'all' | 'open' | 'merged' | 'needs-review';

// Stub data for demonstration
const STUB_PRS: PullRequest[] = [
  {
    id: 'pr-1',
    number: 123,
    title: 'feat: add new monitoring dashboard',
    status: 'open',
    author: 'dev-bot-alpha',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
    branch: 'feature/monitoring-dashboard',
    checks: { passed: 8, failed: 0, pending: 2 },
    reviewers: ['human-reviewer'],
    labels: ['feature', 'frontend'],
  },
  {
    id: 'pr-2',
    number: 122,
    title: 'fix: resolve authentication timeout issue',
    status: 'merged',
    author: 'dev-bot-beta',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    branch: 'fix/auth-timeout',
    checks: { passed: 10, failed: 0, pending: 0 },
    reviewers: ['human-reviewer', 'senior-dev'],
    labels: ['bug', 'backend'],
  },
  {
    id: 'pr-3',
    number: 121,
    title: 'refactor: optimize database queries',
    status: 'open',
    author: 'dev-bot-gamma',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date(Date.now() - 900000).toISOString(),
    branch: 'refactor/db-queries',
    checks: { passed: 5, failed: 2, pending: 1 },
    reviewers: [],
    labels: ['refactor', 'performance'],
  },
];

/**
 * PrTrackingTabContent - Pull Request tracking tab
 *
 * Displays PR status with:
 * - Summary metrics (open PRs, merged today, needs review)
 * - Filterable list (all, open, merged, needs-review)
 * - Detail view with checks and reviewer status
 *
 * NOTE: Currently uses stub data. Connect to GitHub API in the future.
 */
export interface PrTrackingTabContentProps {
  prsData?: PullRequest[];
}

export function PrTrackingTabContent({ prsData = STUB_PRS }: PrTrackingTabContentProps) {
  const [prs] = useState<PullRequest[]>(prsData);
  const [selectedPrId, setSelectedPrId] = useState<string | null>(prs[0]?.id ?? null);
  const [activeFilter, setActiveFilter] = useState<PrFilter>('all');

  const selectedPr = useMemo(() => {
    return prs.find((pr) => pr.id === selectedPrId) ?? null;
  }, [prs, selectedPrId]);

  // Filter PRs
  const filteredPrs = useMemo(() => {
    switch (activeFilter) {
      case 'open':
        return prs.filter((pr) => pr.status === 'open');
      case 'merged':
        return prs.filter((pr) => pr.status === 'merged');
      case 'needs-review':
        return prs.filter((pr) => pr.status === 'open' && pr.reviewers.length === 0);
      case 'all':
      default:
        return prs;
    }
  }, [prs, activeFilter]);

  // Summary cards
  const summaryCards = useMemo(() => {
    const openCount = prs.filter((pr) => pr.status === 'open').length;
    const mergedToday = prs.filter(
      (pr) =>
        pr.status === 'merged' &&
        new Date(pr.updatedAt).getTime() > Date.now() - 86400000
    ).length;
    const needsReview = prs.filter((pr) => pr.status === 'open' && pr.reviewers.length === 0).length;

    return [
      { label: 'Open PRs', value: openCount },
      { label: 'Merged Today', value: mergedToday },
      { label: 'Needs Review', value: needsReview, className: needsReview > 0 ? 'text-orange-600' : '' },
    ];
  }, [prs]);

  // Filter tabs
  const filterTabs = useMemo(() => {
    const openCount = prs.filter((pr) => pr.status === 'open').length;
    const mergedCount = prs.filter((pr) => pr.status === 'merged').length;
    const needsReviewCount = prs.filter((pr) => pr.status === 'open' && pr.reviewers.length === 0).length;

    return [
      { value: 'all' as const, label: 'All', count: prs.length },
      { value: 'open' as const, label: 'Open', count: openCount },
      { value: 'merged' as const, label: 'Merged', count: mergedCount },
      { value: 'needs-review' as const, label: 'Needs Review', count: needsReviewCount },
    ];
  }, [prs]);

  // Render list item
  const renderListItem = (pr: PullRequest, _isSelected: boolean) => {
    const statusIcon =
      pr.status === 'merged' ? (
        <CheckCircle2 className="h-4 w-4 text-purple-500" />
      ) : pr.status === 'closed' ? (
        <AlertCircle className="h-4 w-4 text-red-500" />
      ) : (
        <GitPullRequest className="h-4 w-4 text-green-500" />
      );

    const checksStatus =
      pr.checks.failed > 0
        ? 'text-red-600'
        : pr.checks.pending > 0
          ? 'text-yellow-600'
          : 'text-green-600';

    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          {statusIcon}
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">#{pr.number}</span>
              <Badge variant="outline" className="capitalize">
                {pr.status}
              </Badge>
            </div>
            <p className="text-sm font-medium line-clamp-1">{pr.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>by {pr.author}</span>
          <span>•</span>
          <span className={cn('font-medium', checksStatus)}>
            {pr.checks.passed} passed, {pr.checks.failed} failed, {pr.checks.pending} pending
          </span>
        </div>
        {pr.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {pr.labels.map((label) => (
              <Badge key={label} variant="default" className="text-xs">
                {label}
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Render detail pane
  const renderDetail = (pr: PullRequest | null) => {
    if (!pr) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>No PR Selected</CardTitle>
            <CardDescription>Select a pull request from the list to view details</CardDescription>
          </CardHeader>
        </Card>
      );
    }

    const checksOverall =
      pr.checks.failed > 0 ? 'failed' : pr.checks.pending > 0 ? 'pending' : 'passed';

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>PR #{pr.number}</span>
              <Badge variant="outline" className="capitalize">
                {pr.status}
              </Badge>
            </CardTitle>
            <CardDescription>{pr.title}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-2">Details</h4>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>Author: <span className="text-foreground">{pr.author}</span></p>
                <p>Branch: <span className="font-mono text-foreground">{pr.branch}</span></p>
                <p>Created: {new Date(pr.createdAt).toLocaleString()}</p>
                <p>Updated: {new Date(pr.updatedAt).toLocaleString()}</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Labels</h4>
              {pr.labels.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {pr.labels.map((label) => (
                    <Badge key={label} variant="default">
                      {label}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No labels</p>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Reviewers</h4>
              {pr.reviewers.length > 0 ? (
                <div className="space-y-1">
                  {pr.reviewers.map((reviewer) => (
                    <div key={reviewer} className="flex items-center gap-2">
                      <Badge variant="outline">{reviewer}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-yellow-600">No reviewers assigned</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Checks</span>
              <Badge
                variant={checksOverall === 'passed' ? 'default' : 'outline'}
                className={cn(
                  checksOverall === 'failed' && 'border-red-500 text-red-600',
                  checksOverall === 'pending' && 'border-yellow-500 text-yellow-600',
                  checksOverall === 'passed' && 'bg-green-500'
                )}
              >
                {checksOverall}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Passed</span>
              <Badge variant="outline" className="border-green-500 text-green-600">
                {pr.checks.passed}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Failed</span>
              <Badge variant="outline" className="border-red-500 text-red-600">
                {pr.checks.failed}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Pending</span>
              <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                {pr.checks.pending}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="h-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">PR Tracking</h2>
        <p className="text-sm text-muted-foreground">
          Monitor pull requests created by dev-bots (stub data)
        </p>
      </div>
      <ListDetailLayout<PullRequest, PrFilter>
        summaryCards={summaryCards}
        filterTabs={filterTabs}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        items={filteredPrs}
        selectedItem={selectedPr}
        onSelectItem={(pr) => setSelectedPrId(pr.id)}
        renderListItem={renderListItem}
        renderDetail={renderDetail}
        getItemKey={(pr) => pr.id}
        emptyMessage="No pull requests found for this filter"
      />
    </div>
  );
}
