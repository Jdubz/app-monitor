/**
 * Context Transforms
 *
 * Content extraction and transformation utilities for context recipes.
 */

import type { TransformType } from '../../types/contextRecipe.js';

export class ContextTransforms {
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
    // Remove single-line comments
    let result = content.replace(/\/\/.*$/gm, '');

    // Remove multi-line comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');

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

    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          // End of code block
          blocks.push(currentBlock.join('\n'));
          currentBlock = [];
          inCodeBlock = false;
        } else {
          // Start of code block
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
  extractCodeSections(content: string, sectionNames: string[]): string {
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
          for (let j = i + 1; j < lines.length && braceCount > 0; j++) {
            const nextLine = lines[j];
            sectionLines.push(nextLine);

            for (const char of nextLine) {
              if (char === '{') {
                braceCount++;
              } else if (char === '}') {
                braceCount--;
              }
            }

            i = j; // Update outer loop counter
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
  extractJsonPath(content: string, jsonPath: string): string {
    try {
      const data = JSON.parse(content);

      // Remove leading $ if present
      const path = jsonPath.startsWith('$.') ? jsonPath.slice(2) : jsonPath;

      // Split path into segments
      const segments = path.split(/\.|\[/).map(s => s.replace(/\]$/, ''));

      // Traverse the object
      let result: any = data;
      for (const segment of segments) {
        if (result === undefined || result === null) {
          return '';
        }

        // Handle array indices
        if (/^\d+$/.test(segment)) {
          result = result[parseInt(segment, 10)];
        } else {
          result = result[segment];
        }
      }

      // Convert result back to string format
      if (result === undefined || result === null) {
        return '';
      }

      if (typeof result === 'object') {
        return JSON.stringify(result, null, 2);
      }

      return String(result);
    } catch (error) {
      // Return empty string on parse errors
      return '';
    }
  }
}
