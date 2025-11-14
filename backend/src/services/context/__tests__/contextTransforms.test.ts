/**
 * Context Transforms Tests
 *
 * Comprehensive test suite for ContextTransforms
 * Tests all transforms, extractions, and security validations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextTransforms } from '../contextTransforms.js';
import { mockFileContent } from './helpers/testMocks.js';

describe('ContextTransforms', () => {
  let transforms: ContextTransforms;

  beforeEach(() => {
    transforms = new ContextTransforms();
  });

  describe('transform dispatcher', () => {
    const sampleContent = '# Test\n\nSome content here.';

    it('should apply summarize transform', () => {
      const result = transforms.transform(sampleContent, 'summarize');
      expect(result).toContain('# Test');
    });

    it('should apply strip-comments transform', () => {
      const code = 'const x = 1; // comment';
      const result = transforms.transform(code, 'strip-comments');
      expect(result).not.toContain('// comment');
    });

    it('should apply minify transform', () => {
      const content = '  line 1  \n\n  line 2  \n  ';
      const result = transforms.transform(content, 'minify');
      expect(result).toBe('line 1\nline 2');
    });

    it('should apply bullet-list transform', () => {
      const result = transforms.transform(sampleContent, 'bullet-list');
      expect(result).toContain('**Test**');
    });

    it('should return original content for none transform', () => {
      const result = transforms.transform(sampleContent, 'none');
      expect(result).toBe(sampleContent);
    });

    it('should return original content for unknown transform', () => {
      const result = transforms.transform(sampleContent, 'unknown' as any);
      expect(result).toBe(sampleContent);
    });
  });

  describe('summarize', () => {
    it('should keep headings', () => {
      const content = '# Heading 1\n## Heading 2\n### Heading 3';
      const result = transforms.summarize(content);
      expect(result).toContain('# Heading 1');
      expect(result).toContain('## Heading 2');
      expect(result).toContain('### Heading 3');
    });

    it('should keep first paragraph after heading', () => {
      const content = '# Heading\n\nFirst paragraph.\nSecond paragraph.';
      const result = transforms.summarize(content);
      expect(result).toContain('First paragraph.');
      expect(result).not.toContain('Second paragraph.');
    });

    it('should skip code blocks', () => {
      const content = '# Heading\n\n```typescript\nconst x = 1;\nconst y = 2;\n```\n\nText after code.';
      const result = transforms.summarize(content);
      expect(result).not.toContain('const x = 1');
      expect(result).toContain('Text after code.');
    });

    it('should handle multiple sections', () => {
      const content = '# Section 1\n\nPara 1.\nPara 2.\n\n# Section 2\n\nPara 3.\nPara 4.';
      const result = transforms.summarize(content);
      expect(result).toContain('Para 1.');
      expect(result).not.toContain('Para 2.');
      expect(result).toContain('Para 3.');
      expect(result).not.toContain('Para 4.');
    });

    it('should preserve empty lines between sections', () => {
      const content = '# Heading 1\n\nText.\n\n# Heading 2\n\nMore text.';
      const result = transforms.summarize(content);
      const lines = result.split('\n');
      expect(lines).toContain('');
    });

    it('should handle content with no headings', () => {
      const content = 'Just some text.\nMore text.';
      const result = transforms.summarize(content);
      expect(result).toContain('Just some text.');
      expect(result).not.toContain('More text.');
    });

    it('should handle empty content', () => {
      const result = transforms.summarize('');
      expect(result).toBe('');
    });

    it('should handle content with only code blocks', () => {
      const content = '```typescript\nconst x = 1;\n```';
      const result = transforms.summarize(content);
      expect(result).not.toContain('const x = 1');
    });
  });

  describe('stripComments', () => {
    it('should remove single-line comments', () => {
      const code = 'const x = 1; // this is a comment\nconst y = 2;';
      const result = transforms.stripComments(code);
      expect(result).not.toContain('// this is a comment');
      expect(result).toContain('const x = 1;');
      expect(result).toContain('const y = 2;');
    });

    it('should remove multi-line comments', () => {
      const code = 'const x = 1;\n/* This is a\nmulti-line\ncomment */\nconst y = 2;';
      const result = transforms.stripComments(code);
      expect(result).not.toContain('multi-line');
      expect(result).toContain('const x = 1;');
      expect(result).toContain('const y = 2;');
    });

    it('should clean up extra whitespace', () => {
      const code = 'const x = 1;\n\n\n\nconst y = 2;';
      const result = transforms.stripComments(code);
      expect(result).not.toMatch(/\n\n\n/);
    });

    it('should handle code with no comments', () => {
      const code = 'const x = 1;\nconst y = 2;';
      const result = transforms.stripComments(code);
      expect(result).toContain('const x = 1;');
      expect(result).toContain('const y = 2;');
    });

    it('should handle empty code', () => {
      const result = transforms.stripComments('');
      expect(result).toBe('');
    });

    it('should handle nested multi-line comments', () => {
      const code = 'const x = 1;\n/* outer /* inner */ */\nconst y = 2;';
      const result = transforms.stripComments(code);
      expect(result).toContain('const y = 2;');
    });

    it('should preserve strings that look like comments', () => {
      const code = 'const url = "http://example.com";';
      const result = transforms.stripComments(code);
      expect(result).toContain('http://example.com');
    });
  });

  describe('minify', () => {
    it('should remove leading whitespace', () => {
      const content = '  line 1\n  line 2';
      const result = transforms.minify(content);
      expect(result).toBe('line 1\nline 2');
    });

    it('should remove trailing whitespace', () => {
      const content = 'line 1  \nline 2  ';
      const result = transforms.minify(content);
      expect(result).toBe('line 1\nline 2');
    });

    it('should remove empty lines', () => {
      const content = 'line 1\n\n\nline 2';
      const result = transforms.minify(content);
      expect(result).toBe('line 1\nline 2');
    });

    it('should handle already minified content', () => {
      const content = 'line 1\nline 2';
      const result = transforms.minify(content);
      expect(result).toBe('line 1\nline 2');
    });

    it('should handle empty content', () => {
      const result = transforms.minify('');
      expect(result).toBe('');
    });

    it('should handle content with only whitespace', () => {
      const content = '   \n  \n   ';
      const result = transforms.minify(content);
      expect(result).toBe('');
    });

    it('should preserve single spaces within lines', () => {
      const content = 'hello world\nfoo bar';
      const result = transforms.minify(content);
      expect(result).toBe('hello world\nfoo bar');
    });
  });

  describe('bulletList', () => {
    it('should convert headings to bold text', () => {
      const content = '# Heading 1\n## Heading 2';
      const result = transforms.bulletList(content);
      expect(result).toContain('**Heading 1**');
      expect(result).toContain('**Heading 2**');
    });

    it('should preserve existing list items', () => {
      const content = '- Item 1\n* Item 2\n+ Item 3';
      const result = transforms.bulletList(content);
      expect(result).toContain('- Item 1');
      expect(result).toContain('* Item 2');
      expect(result).toContain('+ Item 3');
    });

    it('should convert paragraphs to bullet items', () => {
      const content = 'First paragraph\nSecond paragraph';
      const result = transforms.bulletList(content);
      expect(result).toContain('- First paragraph');
      expect(result).toContain('- Second paragraph');
    });

    it('should skip empty lines', () => {
      const content = 'Line 1\n\nLine 2';
      const result = transforms.bulletList(content);
      expect(result).toBe('- Line 1\n- Line 2');
    });

    it('should handle mixed content', () => {
      const content = '# Heading\n\nParagraph\n\n- Existing item';
      const result = transforms.bulletList(content);
      expect(result).toContain('**Heading**');
      expect(result).toContain('- Paragraph');
      expect(result).toContain('- Existing item');
    });

    it('should handle empty content', () => {
      const result = transforms.bulletList('');
      expect(result).toBe('');
    });

    it('should handle all heading levels', () => {
      const content = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6';
      const result = transforms.bulletList(content);
      expect(result).toContain('**H1**');
      expect(result).toContain('**H2**');
      expect(result).toContain('**H3**');
      expect(result).toContain('**H4**');
      expect(result).toContain('**H5**');
      expect(result).toContain('**H6**');
    });
  });

  describe('extractHeadings', () => {
    const content = '# Heading 1\n\nContent 1\n\n## Heading 2\n\nContent 2\n\n# Other\n\nOther content';

    it('should extract specific heading and its content', () => {
      const result = transforms.extractHeadings(content, ['Heading 1']);
      expect(result).toContain('# Heading 1');
      expect(result).toContain('Content 1');
      expect(result).not.toContain('Other');
    });

    it('should extract multiple headings', () => {
      const result = transforms.extractHeadings(content, ['Heading 1', 'Heading 2']);
      expect(result).toContain('# Heading 1');
      expect(result).toContain('## Heading 2');
      expect(result).not.toContain('Other');
    });

    it('should be case-insensitive', () => {
      const result = transforms.extractHeadings(content, ['HEADING 1']);
      expect(result).toContain('# Heading 1');
    });

    it('should handle partial matches', () => {
      const result = transforms.extractHeadings(content, ['Heading']);
      expect(result).toContain('# Heading 1');
      expect(result).toContain('## Heading 2');
    });

    it('should normalize heading names with markdown syntax', () => {
      const result = transforms.extractHeadings(content, ['## Heading 2']);
      expect(result).toContain('## Heading 2');
    });

    it('should return empty for non-matching headings', () => {
      const result = transforms.extractHeadings(content, ['Nonexistent']);
      expect(result).toBe('');
    });

    it('should handle empty content', () => {
      const result = transforms.extractHeadings('', ['Test']);
      expect(result).toBe('');
    });

    it('should stop capturing at next heading', () => {
      const result = transforms.extractHeadings(content, ['Heading 1']);
      expect(result).toContain('Content 1');
      expect(result).not.toContain('Content 2');
    });
  });

  describe('extractCodeBlocks', () => {
    it('should extract single code block', () => {
      const content = 'Text\n\n```typescript\nconst x = 1;\n```\n\nMore text';
      const result = transforms.extractCodeBlocks(content);
      expect(result).toContain('const x = 1;');
      expect(result).not.toContain('Text');
      expect(result).not.toContain('More text');
    });

    it('should extract multiple code blocks', () => {
      const content = '```typescript\nconst x = 1;\n```\n\nText\n\n```javascript\nconst y = 2;\n```';
      const result = transforms.extractCodeBlocks(content);
      expect(result).toContain('const x = 1;');
      expect(result).toContain('const y = 2;');
      expect(result).not.toContain('Text');
    });

    it('should handle code blocks with different languages', () => {
      const content = '```python\nprint("hello")\n```\n\n```bash\necho test\n```';
      const result = transforms.extractCodeBlocks(content);
      expect(result).toContain('print("hello")');
      expect(result).toContain('echo test');
    });

    it('should handle empty code blocks', () => {
      const content = '```\n```';
      const result = transforms.extractCodeBlocks(content);
      expect(result).toBe('');
    });

    it('should handle content with no code blocks', () => {
      const content = 'Just regular text';
      const result = transforms.extractCodeBlocks(content);
      expect(result).toBe('');
    });

    it('should handle unclosed code block', () => {
      const content = '```typescript\nconst x = 1;';
      const result = transforms.extractCodeBlocks(content);
      expect(result).toBe('');
    });

    it('should separate multiple blocks with blank line', () => {
      const content = '```\nblock1\n```\n```\nblock2\n```';
      const result = transforms.extractCodeBlocks(content);
      expect(result).toContain('\n\n');
    });
  });

  describe('extractTables', () => {
    const table = '| Col1 | Col2 |\n|------|------|\n| A    | B    |';

    it('should extract single table', () => {
      const content = `Text before\n\n${table}\n\nText after`;
      const result = transforms.extractTables(content);
      expect(result).toContain('| Col1 | Col2 |');
      expect(result).not.toContain('Text before');
      expect(result).not.toContain('Text after');
    });

    it('should extract multiple tables', () => {
      const table2 = '| Col3 | Col4 |\n|------|------|\n| C    | D    |';
      const content = `${table}\n\nText\n\n${table2}`;
      const result = transforms.extractTables(content);
      expect(result).toContain('| Col1 | Col2 |');
      expect(result).toContain('| Col3 | Col4 |');
    });

    it('should handle table at end of content', () => {
      const content = `Text\n\n${table}`;
      const result = transforms.extractTables(content);
      expect(result).toContain('| Col1 | Col2 |');
    });

    it('should handle content with no tables', () => {
      const content = 'Just regular text';
      const result = transforms.extractTables(content);
      expect(result).toBe('');
    });

    it('should handle malformed tables', () => {
      const content = '| Col1 | Col2\nNot a table row\n| Col3 | Col4 |';
      const result = transforms.extractTables(content);
      expect(result).toContain('| Col3 | Col4 |');
    });

    it('should separate multiple tables with blank line', () => {
      const table2 = '| Col3 | Col4 |\n|------|------|';
      const content = `${table}\n\n${table2}`;
      const result = transforms.extractTables(content);
      expect(result).toContain('\n\n');
    });

    it('should handle empty content', () => {
      const result = transforms.extractTables('');
      expect(result).toBe('');
    });
  });

  describe('extractCodeSections', () => {
    const code = `
function testFunction() {
  return 'test';
}

class TestClass {
  constructor() {
    this.value = 1;
  }
}

const testConst = () => {
  return 42;
};
`;

    it('should extract function by name', () => {
      const result = transforms.extractCodeSections(code, ['testFunction']);
      expect(result).toContain('function testFunction()');
      expect(result).toContain("return 'test';");
    });

    it('should extract class by name', () => {
      const result = transforms.extractCodeSections(code, ['TestClass']);
      expect(result).toContain('class TestClass');
      expect(result).toContain('constructor()');
    });

    it('should extract const function by name', () => {
      const result = transforms.extractCodeSections(code, ['testConst']);
      expect(result).toContain('const testConst = ()');
      expect(result).toContain('return 42');
    });

    it('should extract multiple sections', () => {
      const result = transforms.extractCodeSections(code, ['testFunction', 'TestClass']);
      expect(result).toContain('function testFunction()');
      expect(result).toContain('class TestClass');
    });

    it('should handle non-matching section names', () => {
      const result = transforms.extractCodeSections(code, ['nonexistent']);
      expect(result).toBe('');
    });

    it('should handle empty code', () => {
      const result = transforms.extractCodeSections('', ['test']);
      expect(result).toBe('');
    });

    it('should handle nested braces correctly', () => {
      const nestedCode = `
function outer() {
  function inner() {
    return { key: 'value' };
  }
  return inner();
}
`;
      const result = transforms.extractCodeSections(nestedCode, ['outer']);
      expect(result).toContain('function outer()');
      expect(result).toContain('function inner()');
      expect(result).toContain('return inner();');
    });

    it('should respect maxLinesPerSection limit', () => {
      const longCode = `
function longFunction() {
${Array(2000).fill('  // line').join('\n')}
}
`;
      const result = transforms.extractCodeSections(longCode, ['longFunction'], 100);
      const lines = result.split('\n');
      expect(lines.length).toBeLessThan(200);
    });

    it('should separate multiple sections with blank line', () => {
      const result = transforms.extractCodeSections(code, ['testFunction', 'TestClass']);
      expect(result).toContain('\n\n');
    });

    it('should handle let and var declarations', () => {
      const varCode = `
let letVar = 1;
var varVar = 2;
`;
      const result = transforms.extractCodeSections(varCode, ['letVar']);
      expect(result).toContain('let letVar');
    });
  });

  describe('extractJsonPath', () => {
    const jsonContent = JSON.stringify({
      name: 'test',
      config: {
        setting1: 'value1',
        nested: {
          deep: 'found'
        }
      },
      array: [1, 2, 3],
      items: [
        { id: 1, name: 'first' },
        { id: 2, name: 'second' }
      ]
    }, null, 2);

    it('should extract top-level property', () => {
      const result = transforms.extractJsonPath(jsonContent, '$.name');
      expect(result).toBe('test');
    });

    it('should extract nested property', () => {
      const result = transforms.extractJsonPath(jsonContent, '$.config.setting1');
      expect(result).toBe('value1');
    });

    it('should extract deeply nested property', () => {
      const result = transforms.extractJsonPath(jsonContent, '$.config.nested.deep');
      expect(result).toBe('found');
    });

    it('should extract array element by index', () => {
      const result = transforms.extractJsonPath(jsonContent, '$.array[0]');
      expect(result).toBe('1');
    });

    it('should extract property from array element', () => {
      const result = transforms.extractJsonPath(jsonContent, '$.items[0].name');
      expect(result).toBe('first');
    });

    it('should extract object and format as JSON', () => {
      const result = transforms.extractJsonPath(jsonContent, '$.config');
      expect(result).toContain('setting1');
      expect(result).toContain('value1');
    });

    it('should return entire object for root path', () => {
      const result = transforms.extractJsonPath(jsonContent, '$.');
      expect(result).toContain('name');
      expect(result).toContain('config');
    });

    it('should return empty for non-existent path', () => {
      const result = transforms.extractJsonPath(jsonContent, '$.nonexistent');
      expect(result).toBe('');
    });

    it('should return empty for invalid array index', () => {
      const result = transforms.extractJsonPath(jsonContent, '$.array[999]');
      expect(result).toBe('');
    });

    it('should return empty for negative array index', () => {
      const result = transforms.extractJsonPath(jsonContent, '$.array[-1]');
      expect(result).toBe('');
    });

    it('should reject path not starting with $.', () => {
      const result = transforms.extractJsonPath(jsonContent, 'config.setting1');
      expect(result).toBe('');
    });

    it('should reject empty path', () => {
      const result = transforms.extractJsonPath(jsonContent, '');
      expect(result).toBe('');
    });

    it('should reject path with empty segments', () => {
      const result = transforms.extractJsonPath(jsonContent, '$.config..nested');
      expect(result).toBe('');
    });

    it('should prevent __proto__ access', () => {
      const result = transforms.extractJsonPath(jsonContent, '$.__proto__');
      expect(result).toBe('');
    });

    it('should prevent constructor access', () => {
      const result = transforms.extractJsonPath(jsonContent, '$.constructor');
      expect(result).toBe('');
    });

    it('should prevent prototype access', () => {
      const result = transforms.extractJsonPath(jsonContent, '$.prototype');
      expect(result).toBe('');
    });

    it('should handle invalid JSON', () => {
      const result = transforms.extractJsonPath('invalid json', '$.test');
      expect(result).toBe('');
    });

    it('should handle null values in path', () => {
      const nullJson = JSON.stringify({ a: null, b: { c: 'value' } });
      const result = transforms.extractJsonPath(nullJson, '$.a.b');
      expect(result).toBe('');
    });

    it('should handle undefined values in path', () => {
      const result = transforms.extractJsonPath(jsonContent, '$.config.nested.nonexistent.deeper');
      expect(result).toBe('');
    });

    it('should enforce max depth limit', () => {
      const deepPath = '$.a.b.c.d.e.f.g.h.i.j.k.l.m';
      const deepJson = JSON.stringify({
        a: { b: { c: { d: { e: { f: { g: { h: { i: { j: { k: { l: { m: 'deep' } } } } } } } } } } } }
      });
      const result = transforms.extractJsonPath(deepJson, deepPath, 5);
      expect(result).toBe('');
    });

    it('should handle circular references in result', () => {
      const obj: any = { name: 'test' };
      obj.self = obj;
      const circular = JSON.stringify(obj, (key, value) => {
        if (key === 'self') return '[Circular]';
        return value;
      });
      const result = transforms.extractJsonPath(circular, '$.name');
      expect(result).toBe('test');
    });

    it('should handle non-string JSONPath parameter', () => {
      const result = transforms.extractJsonPath(jsonContent, null as any);
      expect(result).toBe('');
    });

    it('should handle array access on non-array', () => {
      const result = transforms.extractJsonPath(jsonContent, '$.name[0]');
      expect(result).toBe('');
    });
  });
});
