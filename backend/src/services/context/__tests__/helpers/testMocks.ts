/**
 * Test Mocks and Factories
 *
 * Factory functions to create test data for context system tests.
 * All mocks are self-contained and don't require external dependencies.
 */

import type {
  ContextRecipe,
  ContextBundle,
  BundleCacheEntry,
  ProfileContent,
  RecipeSource,
  RecipeTaskType
} from '../../../types/contextBundle.js';

/**
 * Create a mock context recipe
 */
export function mockRecipe(overrides?: Partial<ContextRecipe>): ContextRecipe {
  return {
    profile: 'test-profile',
    version: '1.0.0',
    description: 'Test recipe for unit testing',
    taskTypes: ['implementation', 'fix'] as RecipeTaskType[],
    sources: [
      {
        type: 'markdown',
        path: 'docs/test.md',
        optional: false
      }
    ],
    sizeLimit: {
      maxBytes: 1024 * 1024, // 1MB
      maxInlineBytes: 512 * 1024 // 512KB
    },
    outputs: {
      format: 'markdown',
      filename: 'context-{profile}.md',
      includeMetadata: true
    },
    investigationSteps: ['Review the code', 'Check the logs'],
    constraints: ['Stay within scope', 'Follow coding standards'],
    dependencies: [],
    required: false,
    ttl: 3600,
    ...overrides
  };
}

/**
 * Create a mock recipe source
 */
export function mockSource(overrides?: Partial<RecipeSource>): RecipeSource {
  return {
    type: 'markdown',
    path: 'docs/test.md',
    optional: false,
    ...overrides
  };
}

/**
 * Create a mock profile content
 */
export function mockProfileContent(overrides?: Partial<ProfileContent>): ProfileContent {
  const content = 'Test content for profile';
  return {
    profile: 'test-profile',
    content,
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
    sources: ['docs/test.md'],
    generatedAt: new Date(),
    ...overrides
  };
}

/**
 * Create a mock context bundle
 */
export function mockBundle(overrides?: Partial<ContextBundle>): ContextBundle {
  const bundleId = 'test-bundle-' + Math.random().toString(36).substring(7);
  const profileContent = mockProfileContent();

  return {
    id: bundleId,
    profileContents: {
      'test-profile': profileContent
    },
    metadata: {
      bundleId,
      taskType: 'implementation',
      profiles: ['test-profile'],
      totalBytes: profileContent.sizeBytes,
      cacheKey: 'test-cache-key',
      createdAt: new Date(),
      expiresAt: undefined
    },
    mountPath: `/context/${bundleId}`,
    cacheKey: 'test-cache-key',
    ...overrides
  };
}

/**
 * Create a mock cache entry
 */
export function mockCacheEntry(overrides?: Partial<BundleCacheEntry>): BundleCacheEntry {
  const now = new Date();
  return {
    bundleId: 'test-bundle-id',
    cacheKey: 'test-cache-key',
    taskType: 'implementation',
    profiles: ['test-profile'],
    mountPath: '/context/test-bundle-id',
    sizeBytes: 1024,
    createdAt: now,
    expiresAt: undefined,
    hitCount: 0,
    lastAccessedAt: now,
    ...overrides
  };
}

/**
 * Create mock file content for different file types
 */
export const mockFileContent = {
  markdown: `# Test Document

## Introduction
This is a test markdown file for unit testing.

## Features
- Feature 1
- Feature 2
- Feature 3

\`\`\`typescript
function example() {
  return 'test';
}
\`\`\`

## Conclusion
End of test document.
`,

  code: `/**
 * Test code file
 */

export class TestClass {
  private value: string;

  constructor(value: string) {
    this.value = value;
  }

  getValue(): string {
    return this.value;
  }
}

export function testFunction(input: string): string {
  return input.toUpperCase();
}
`,

  json: `{
  "name": "test-package",
  "version": "1.0.0",
  "config": {
    "setting1": "value1",
    "setting2": 42,
    "nested": {
      "deep": {
        "value": "found-me"
      }
    }
  },
  "array": [1, 2, 3, 4, 5]
}`,

  yaml: `profile: test-profile
version: 1.0.0
description: Test YAML file
taskTypes:
  - implementation
  - fix
sources:
  - type: markdown
    path: docs/test.md
`,

  table: `| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Value 1  | Value 2  | Value 3  |
| Value 4  | Value 5  | Value 6  |
`
};

/**
 * Create a mock DevBotsDatabase instance
 * For use with dependency injection in tests
 */
export function mockDatabase() {
  const mockDb = {
    getConnection: vi.fn(() => ({
      prepare: vi.fn(() => ({
        get: vi.fn(),
        run: vi.fn(),
        all: vi.fn()
      }))
    }))
  };

  return mockDb;
}
