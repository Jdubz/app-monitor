import { describe, it, expect } from 'vitest';
import { toTitleCase } from '../stringUtils.js';

describe('stringUtils', () => {
  describe('toTitleCase', () => {
    it('converts lowercase words to title case', () => {
      expect(toTitleCase('hello world')).toBe('Hello World');
    });

    it('normalizes mixed casing and preserves separators', () => {
      expect(toTitleCase('multi-word_title')).toBe('Multi-Word_Title');
    });

    it('handles leading/trailing and repeated whitespace', () => {
      expect(toTitleCase('  leading and   multiple spaces  ')).toBe(
        '  Leading And   Multiple Spaces  '
      );
    });

    it('leaves numbers untouched and capitalizes letters after them', () => {
      expect(toTitleCase('api v2 release')).toBe('Api V2 Release');
    });

    it('returns empty string when input is empty', () => {
      expect(toTitleCase('')).toBe('');
    });
  });
});
