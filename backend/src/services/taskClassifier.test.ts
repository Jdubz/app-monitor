import { describe, it, expect, beforeEach } from 'vitest';
import { TaskClassifier } from './taskClassifier.js';

describe('TaskClassifier', () => {
  let classifier: TaskClassifier;

  beforeEach(() => {
    classifier = new TaskClassifier();
  });

  describe('classifyTask', () => {
    it('should classify implementation tasks correctly', () => {
      const task = {
        title: 'Implement user authentication',
        description: `Add JWT authentication to the backend API. Modify auth.ts and user.service.ts files to support token-based authentication.
        Implement token generation, validation, refresh logic, and secure cookie handling. Update middleware to check authentication
        on protected routes and add proper error handling for expired tokens.`
      };

      const result = classifier.classifyTask(task);

      expect(result.category).toBe('implementation');
      expect(result.filePatterns).toContain('ts');
      expect(result.complexity).toBe('medium');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify documentation tasks correctly', () => {
      const task = {
        title: 'Update API documentation',
        description: 'Write comprehensive API docs in the README.md file explaining all endpoints.'
      };

      const result = classifier.classifyTask(task);

      expect(result.category).toBe('documentation');
      expect(result.filePatterns).toContain('md');
      expect(result.complexity).toBe('simple');
    });

    it('should classify analysis tasks correctly', () => {
      const task = {
        title: 'Investigate performance bottleneck',
        description: 'Analyze slow query performance in the database layer and check index usage patterns.'
      };

      const result = classifier.classifyTask(task);

      expect(result.category).toBe('analysis');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should classify review tasks correctly', () => {
      const task = {
        title: 'Review PR #42',
        description: 'Code review for new authentication feature'
      };

      const result = classifier.classifyTask(task);

      expect(result.category).toBe('review');
    });

    it('should classify planning tasks correctly', () => {
      const task = {
        title: 'Design database schema',
        description: 'Plan the schema for the new user management system'
      };

      const result = classifier.classifyTask(task);

      expect(result.category).toBe('planning');
    });

    it('should extract multiple file patterns', () => {
      const task = {
        title: 'Update frontend and backend',
        description: 'Modify App.tsx, styles.css, and api.ts files for the new feature'
      };

      const result = classifier.classifyTask(task);

      expect(result.filePatterns).toContain('tsx');
      expect(result.filePatterns).toContain('css');
      expect(result.filePatterns).toContain('ts');
      expect(result.filePatterns.length).toBe(3);
    });

    it('should estimate simple complexity for small tasks', () => {
      const task = {
        title: 'Fix typo in README',
        description: 'Quick fix for a simple typo in README.md'
      };

      const result = classifier.classifyTask(task);

      expect(result.complexity).toBe('simple');
    });

    it('should estimate complex complexity for large tasks', () => {
      const task = {
        title: 'Refactor entire authentication system',
        description: `Complete rewrite of the authentication system affecting multiple files across frontend and backend. 
        This involves updating the login flow, session management, token refresh logic, user permissions, 
        and integrating with the new OAuth provider. Will need to modify auth.service.ts, user.controller.ts, 
        session.middleware.ts, auth.routes.ts, and corresponding frontend components.`
      };

      const result = classifier.classifyTask(task);

      expect(result.complexity).toBe('complex');
    });

    it('should default to implementation for unclear tasks', () => {
      const task = {
        title: 'Do something',
        description: 'Task with unclear intent'
      };

      const result = classifier.classifyTask(task);

      expect(result.category).toBe('implementation');
      expect(result.confidence).toBeLessThan(0.9);
    });

    it('should provide reasoning for classification', () => {
      const task = {
        title: 'Implement login feature',
        description: 'Add login functionality to the app.ts file'
      };

      const result = classifier.classifyTask(task);

      expect(result.reasoning).toBeTruthy();
      expect(result.reasoning.length).toBeGreaterThan(0);
      expect(result.reasoning).toContain('implementation');
    });
  });

  describe('classifyBatch', () => {
    it('should classify multiple tasks efficiently', () => {
      const tasks = [
        { title: 'Implement feature', description: 'Add new feature' },
        { title: 'Document API', description: 'Write docs for API' },
        { title: 'Analyze performance', description: 'Check performance issues' }
      ];

      const results = classifier.classifyBatch(tasks);

      expect(results.size).toBe(3);
      
      const classifications = Array.from(results.values());
      expect(classifications[0].category).toBe('implementation');
      expect(classifications[1].category).toBe('documentation');
      expect(classifications[2].category).toBe('analysis');
    });
  });
});
