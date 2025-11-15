/**
 * Report Issue Button - Minimalist UI
 *
 * Single button that sends timestamp + trace ID to backend.
 * Triggers immediate autonomous triage and task creation.
 */

import React, { useState } from 'react';
import { logger } from '../utils/observability/logger';
import type { IssueReportRequest, IssueReportApiResponse } from '../../../shared/api-contracts';
import { AlertCircle, CheckCircle } from 'lucide-react';

export function ReportIssueButton() {
  const [reporting, setReporting] = useState(false);
  const [lastReported, setLastReported] = useState<Date | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleReportIssue = async () => {
    if (reporting) return;

    setReporting(true);
    setShowSuccess(false);

    try {
      const traceId = logger.generateTraceId();
      const report: IssueReportRequest = {
        timestamp: new Date().toISOString(),
        traceId,
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

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: IssueReportApiResponse = await response.json();

      if (data.success) {
        setLastReported(new Date());
        setShowSuccess(true);

        logger.info('Issue reported successfully', 'ReportIssueButton', {
          issueId: data.data.issueId,
          traceId: report.traceId,
        });

        // Hide success message after 3 seconds
        setTimeout(() => setShowSuccess(false), 3000);
      } else {
        throw new Error('API returned success: false');
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
    <div className="relative">
      <button
        onClick={handleReportIssue}
        disabled={reporting || !canReport}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title={
          !canReport
            ? 'Please wait 60 seconds between reports'
            : 'Report an issue with this page'
        }
      >
        <AlertCircle className="w-4 h-4" />
        {reporting ? 'Reporting...' : 'Report Issue'}
      </button>

      {showSuccess && (
        <div className="absolute top-full mt-2 right-0 z-50 min-w-max">
          <div className="bg-green-50 border border-green-200 rounded-md px-3 py-2 flex items-center gap-2 shadow-lg">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm text-green-800">Issue reported! Triage started.</span>
          </div>
        </div>
      )}
    </div>
  );
}
