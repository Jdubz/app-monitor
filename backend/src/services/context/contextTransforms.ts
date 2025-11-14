/**
 * Context Transforms
 *
 * Content extraction and transformation utilities for context recipes.
 */

import { getContextLogger } from './contextLogger.js';
import type { TransformType } from '../../types/contextRecipe.js';

export class ContextTransforms {
  private logger = getContextLogger();

  /**
   * Apply a transform to content
   */
  transform(content: string, transformType: TransformType = 'none'): string {
    switch (transformType) {
      case 'summarize':
        return this.summarize(content);
      case 'strip-comments':
        return this.stripComments(content);
      case 'minify':
        return this.minify(content);
      case 'bullet-list':
        return this.bulletList(content);
      case 'none':
      default:
        return content;
    }
  }

  /**
   * Summarize content - keep headings and first paragraph of each section
   */
  summarize(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let inCodeBlock = false;
    let paragraphCount = 0;

    for (const line of lines) {
      // Track code blocks
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }

      // Skip code block content
      if (inCodeBlock) {
        continue;
      }

      // Keep headings
      if (line.match(/^#{1,6}\s/)) {
        result.push(line);
        paragraphCount = 0;
        continue;
      }

      // Keep first paragraph after heading
      if (line.trim() && paragraphCount === 0) {
        result.push(line);
        paragraphCount++;
      } else if (!line.trim()) {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /**
   * Strip comments from code
   */
  stripComments(content: string): string {
    let result = '';
    let i = 0;

    while (i < content.length) {
      // Handle strings - preserve them completely
      if (content[i] === '"' || content[i] === "'" || content[i] === '`') {
        const quote = content[i];
        result += content[i];
        i++;

        // Copy everything until closing quote, handling escapes
        while (i < content.length) {
          if (content[i] === '\\' && i + 1 < content.length) {
            result += content[i] + content[i + 1];
            i += 2;
          } else if (content[i] === quote) {
            result += content[i];
            i++;
            break;
          } else {
            result += content[i];
            i++;
          }
        }
      }
      // Handle single-line comments
      else if (content[i] === '/' && content[i + 1] === '/') {
        // Skip until end of line
        i += 2;
        while (i < content.length && content[i] !== '\n') {
          i++;
        }
      }
      // Handle multi-line comments
      else if (content[i] === '/' && content[i + 1] === '*') {
        // Skip until */
        i += 2;
        while (i < content.length - 1) {
          if (content[i] === '*' && content[i + 1] === '/') {
            i += 2;
            break;
          }
          i++;
        }
      }
      // Regular content
      else {
        result += content[i];
        i++;
      }
    }

    // Clean up extra whitespace
    result = result.replace(/\n\s*\n\s*\n/g, '\n\n');

    return result;
  }

  /**
   * Minify content - remove extra whitespace
   */
  minify(content: string): string {
    const lines = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    return lines.join('\n');
  }

  /**
   * Convert content to bullet list format
   */
  bulletList(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      // Convert headings to bold text
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        result.push(`**${headingMatch[2]}**`);
        continue;
      }

      // Keep existing list items
      if (trimmed.match(/^[-*+]\s/)) {
        result.push(trimmed);
        continue;
      }

      // Convert paragraphs to bullet items
      result.push(`- ${trimmed}`);
    }

    return result.join('\n');
  }

  /**
   * Extract specific headings and their content
   */
  extractHeadings(content: string, headingNames: string[]): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let capturing = false;

    // Normalize heading names by removing markdown syntax
    const normalizedNames = headingNames.map(name =>
      name.replace(/^#{1,6}\s+/, '').trim()
    );

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        const headingText = headingMatch[2];
        const matchesFilter = normalizedNames.some(name =>
          headingText.toLowerCase().includes(name.toLowerCase())
        );

        if (matchesFilter) {
          capturing = true;
          result.push(line);
        } else {
          capturing = false;
        }
      } else if (capturing) {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /**
   * Extract code blocks from markdown
   */
  extractCodeBlocks(content: string): string {
    const blocks: string[] = [];
    const lines = content.split('\n');
    let inCodeBlock = false;
    let currentBlock: string[] = [];
    let openingMarker = '';

    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          // End of code block - add closing marker and save block
          currentBlock.push('```');
          blocks.push(currentBlock.join('\n'));
          currentBlock = [];
          inCodeBlock = false;
          openingMarker = '';
        } else {
          // Start of code block - save opening marker
          openingMarker = line;
          currentBlock.push(openingMarker);
          inCodeBlock = true;
        }
      } else if (inCodeBlock) {
        currentBlock.push(line);
      }
    }

    return blocks.join('\n\n');
  }

  /**
   * Extract markdown tables
   */
  extractTables(content: string): string {
    const tables: string[] = [];
    const lines = content.split('\n');
    let inTable = false;
    let currentTable: string[] = [];

    for (const line of lines) {
      const isTableRow = line.trim().startsWith('|') && line.trim().endsWith('|');

      if (isTableRow) {
        if (!inTable) {
          inTable = true;
        }
        currentTable.push(line);
      } else if (inTable) {
        // End of table
        tables.push(currentTable.join('\n'));
        currentTable = [];
        inTable = false;
      }
    }

    // Add last table if still capturing
    if (currentTable.length > 0) {
      tables.push(currentTable.join('\n'));
    }

    return tables.join('\n\n');
  }

  /**
   * Extract specific code sections (functions, classes, etc.)
   */
  extractCodeSections(content: string, sectionNames: string[], maxLinesPerSection: number = 1000): string {
    const sections: string[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if line contains any of the section names
      const matchesSection = sectionNames.some(name => {
        const regex = new RegExp(`\\b(function|class|const|let|var)\\s+${name}\\b`);
        return regex.test(line);
      });

      if (matchesSection) {
        // Extract the entire section by tracking braces
        const sectionLines: string[] = [line];
        let braceCount = 0;
        let inSection = false;

        // Count opening braces in the declaration line
        for (const char of line) {
          if (char === '{') {
            braceCount++;
            inSection = true;
          } else if (char === '}') {
            braceCount--;
          }
        }

        // Continue extracting lines until braces are balanced
        if (inSection) {
          let linesExtracted = 0;
          for (let j = i + 1; j < lines.length && braceCount > 0 && linesExtracted < maxLinesPerSection; j++) {
            const nextLine = lines[j];
            sectionLines.push(nextLine);
            linesExtracted++;

            for (const char of nextLine) {
              if (char === '{') {
                braceCount++;
              } else if (char === '}') {
                braceCount--;
              }
            }

            i = j; // Update outer loop counter
          }

          // Warn if section was truncated
          if (braceCount > 0) {
            this.logger.warn('Code section extraction incomplete - possible brace imbalance or section too large', {
              component: 'ContextTransforms',
              operation: 'extractCodeSections',
              linesExtracted,
              maxLinesPerSection
            });
          }
        }

        sections.push(sectionLines.join('\n'));
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Extract content from JSON using JSONPath-like syntax
   * Supports basic paths like $.key, $.key.nested, $.array[0]
   */
  extractJsonPath(content: string, jsonPath: string, maxDepth: number = 10): string {
    // Validate jsonPath format
    if (!jsonPath || typeof jsonPath !== 'string') {
      this.logger.warn('Invalid JSONPath: must be a non-empty string', { component: 'ContextTransforms', operation: 'extractJsonPath' });
      return '';
    }

    if (!jsonPath.startsWith('$.')) {
      this.logger.warn('Invalid JSONPath: must start with $.', { component: 'ContextTransforms', operation: 'extractJsonPath', jsonPath });
      return '';
    }

    try {
      const data = JSON.parse(content);

      // Remove leading $.
      const path = jsonPath.slice(2);

      if (!path) {
        return JSON.stringify(data, null, 2);
      }

      // Split and sanitize path segments
      const segments = path.split(/\.|\[/).map(s => s.replace(/\]$/, '').trim());

      // Validate segments
      for (const segment of segments) {
        if (segment.length === 0) {
          this.logger.warn('Invalid JSONPath: empty segment', { component: 'ContextTransforms', operation: 'extractJsonPath', jsonPath });
          return '';
        }
        // Check for dangerous segment names to prevent prototype pollution
        if (segment === '__proto__' || segment === 'constructor' || segment === 'prototype') {
          this.logger.warn('Invalid JSONPath: dangerous property access', { component: 'ContextTransforms', operation: 'extractJsonPath', jsonPath, segment });
          return '';
        }
      }

      // Traverse with depth limit
      let result: any = data;
      let depth = 0;

      for (const segment of segments) {
        if (depth++ > maxDepth) {
          this.logger.warn('JSONPath traversal exceeded max depth', { component: 'ContextTransforms', operation: 'extractJsonPath', jsonPath, maxDepth });
          return '';
        }

        if (result === undefined || result === null) {
          return '';
        }

        // Handle array indices
        if (/^\d+$/.test(segment)) {
          const index = parseInt(segment, 10);
          if (!Array.isArray(result) || index >= result.length || index < 0) {
            return '';
          }
          result = result[index];
        } else {
          if (typeof result !== 'object' || !Object.prototype.hasOwnProperty.call(result, segment)) {
            return '';
          }
          result = result[segment];
        }
      }

      // Convert result back to string with circular reference protection
      if (result === undefined || result === null) {
        return '';
      }

      if (typeof result === 'object') {
        const seen = new WeakSet();
        return JSON.stringify(result, (key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
              return '[Circular]';
            }
            seen.add(value);
          }
          return value;
        }, 2);
      }

      return String(result);
    } catch (error) {
      this.logger.warn('Failed to extract JSONPath', { component: 'ContextTransforms', operation: 'extractJsonPath', jsonPath }, error instanceof Error ? error : undefined);
      return '';
    }
  }
}
