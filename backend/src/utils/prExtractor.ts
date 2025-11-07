/**
 * PR Information Extractor
 *
 * Extracts PR number, URL, and branch from bot task output.
 * Bots are instructed to output this information in a specific format.
 */

export interface PRInfo {
  number: number;
  url: string;
  branch: string;
}

/**
 * Extract PR information from bot output
 *
 * Expected format in output:
 * ```
 * =========================================
 * PR_NUMBER: 42
 * PR_URL: https://github.com/owner/repo/pull/42
 * PR_BRANCH: task-feat-add-feature
 * =========================================
 * ```
 *
 * @param output - The bot's task output
 * @returns PRInfo if found, null otherwise
 */
export function extractPRInfo(output: string): PRInfo | null {
  if (!output) {
    return null;
  }

  // Pattern 1: Explicit format (recommended)
  const prNumberMatch = output.match(/PR_NUMBER:\s*(\d+)/i);
  const prUrlMatch = output.match(/PR_URL:\s*(https?:\/\/[^\s]+)/i);
  const prBranchMatch = output.match(/PR_BRANCH:\s*([^\s\n]+)/i);

  if (prNumberMatch && prUrlMatch && prBranchMatch) {
    return {
      number: parseInt(prNumberMatch[1], 10),
      url: prUrlMatch[1],
      branch: prBranchMatch[1]
    };
  }

  // Pattern 2: Parse from gh pr create output
  // Output looks like: "https://github.com/owner/repo/pull/42"
  const ghOutputMatch = output.match(/https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/i);
  if (ghOutputMatch) {
    const number = parseInt(ghOutputMatch[1], 10);
    const url = ghOutputMatch[0];

    // Try to find branch name from git commands in output
    const branchMatch = output.match(/(?:checkout -b|HEAD ->\s*)(?:origin\/)?([^\s\n]+)/i);
    const branch = branchMatch ? branchMatch[1] : `task-pr-${number}`;

    return {
      number,
      url,
      branch
    };
  }

  // Pattern 3: Parse from PR merge message format
  // "Pull request #42 from owner/branch"
  const mergeMatch = output.match(/Pull request #(\d+) from [^/]+\/([^\s\n]+)/i);
  if (mergeMatch) {
    const number = parseInt(mergeMatch[1], 10);
    const branch = mergeMatch[2];
    // Reconstruct URL (will need to be configured with repo owner/name)
    const url = `https://github.com/Jdubz/app-monitor/pull/${number}`;

    return {
      number,
      url,
      branch
    };
  }

  return null;
}

/**
 * Validate PR information
 *
 * @param prInfo - PR information to validate
 * @returns true if valid, false otherwise
 */
export function isValidPRInfo(prInfo: PRInfo | null): prInfo is PRInfo {
  if (!prInfo) {
    return false;
  }

  return (
    typeof prInfo.number === 'number' &&
    prInfo.number > 0 &&
    typeof prInfo.url === 'string' &&
    prInfo.url.startsWith('http') &&
    typeof prInfo.branch === 'string' &&
    prInfo.branch.length > 0
  );
}

/**
 * Extract just the PR number from various formats
 *
 * @param text - Text that might contain a PR reference
 * @returns PR number if found, null otherwise
 */
export function extractPRNumber(text: string): number | null {
  if (!text) {
    return null;
  }

  // Try various patterns
  const patterns = [
    /PR_NUMBER:\s*(\d+)/i,
    /#(\d+)/,
    /pull\/(\d+)/i,
    /pr[:\s]+(\d+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > 0) {
        return num;
      }
    }
  }

  return null;
}
