export const AI_REVIEWER_PATTERNS: string[] = [
  'copilot',
  'github-actions',
  'github-advanced-security',
  'gemini',
  'code-assist',
  'gemini-code-assist',
  'google',
];

export const isAiReviewer = (author: string): boolean => {
  const lowerAuthor = author.toLowerCase();
  return AI_REVIEWER_PATTERNS.some(pattern => lowerAuthor.includes(pattern));
};
