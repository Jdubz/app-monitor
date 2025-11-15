/**
 * Report Issue Button - Minimalist UI
 *
 * Single button that sends timestamp + trace ID to backend.
 * No modals, no forms, no complexity.
 */

import React, { useState } from 'react';
import { logger } from '../utils/observability/logger';

interface IssueReport {
  timestamp: string;
  traceId?: string;
  sessionId: string;
  route: string;
  userAgent: string;
  description?: string;
}

export function ReportIssueButton() {
  const [reporting, setReporting] = useState(false);
  const [lastReported, setLastReported] = useState<Date | null>(null);

  const handleReportIssue = async () => {
    if (reporting) return;

    setReporting(true);

    try {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: logger.getSessionId(),
        route: window.location.pathname,
        userAgent: navigator.userAgent,
      };

      const response = await fetch('/api/issues', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(report),
      });

      if (response.ok) {
        setLastReported(new Date());
        logger.info('Issue reported', 'ReportIssueButton', {
          issueTimestamp: report.timestamp,
        });
      } else {
        throw new Error('Failed to report issue');
      }
    } catch (error) {
      logger.error(
        'Failed to report issue',
        'ReportIssueButton',
        error instanceof Error ? error : undefined
      );
    } finally {
      setReporting(false);
    }
  };

  // Prevent spam - only allow reporting once per minute
  const canReport = !lastReported || Date.now() - lastReported.getTime() > 60000;

  return (
    <button
      onClick={handleReportIssue}
      disabled={reporting || !canReport}
      className="report-issue-button"
      title={
        !canReport
          ? 'Please wait 60 seconds between reports'
          : 'Report an issue with this page'
      }
    >
      {reporting ? 'Reporting...' : 'Report Issue'}
    </button>
  );
}
