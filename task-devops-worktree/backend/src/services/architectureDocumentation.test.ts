/**
 * Unit tests for Architecture Documentation System
 * Tests the getSystemArchitectureDocs method and architecture link generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskPromptTemplateManager } from './taskPromptTemplates.js';

describe('Architecture Documentation System', () => {
  let templateManager: TaskPromptTemplateManager;

  beforeEach(() => {
    templateManager = new TaskPromptTemplateManager();
  });

  describe('System-Specific Documentation Links', () => {
    it('should return backend documentation for job-finder-BE project', () => {
      // Access the private method through reflection for testing
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      const docs = getSystemArchitectureDocs('job-finder-BE');

      expect(docs).toHaveLength(4);
      expect(docs).toContain('- [Backend Architecture](../docs/architecture/backend.md)');
      expect(docs).toContain('- [Database Schema](../docs/architecture/database-schema.md)');
      expect(docs).toContain('- [Firebase Functions Guide](../docs/deployment/FIREBASE_FUNCTIONS_V2_PERMISSIONS_GUIDE.md)');
      expect(docs).toContain('- [Firestore Setup](../docs/deployment/FIRESTORE_COMPLETE_SETUP.md)');
    });

    it('should return backend documentation for backend project', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      const docs = getSystemArchitectureDocs('backend');

      expect(docs).toHaveLength(4);
      expect(docs).toContain('- [Backend Architecture](../docs/architecture/backend.md)');
    });

    it('should return frontend documentation for job-finder-FE project', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      const docs = getSystemArchitectureDocs('job-finder-FE');

      expect(docs).toHaveLength(3);
      expect(docs).toContain('- [Frontend Architecture](../docs/architecture/frontend.md)');
      expect(docs).toContain('- [Development Stack](../docs/development/DEVELOPMENT_STACK.md)');
      expect(docs).toContain('- [Frontend Deployment](../docs/deployment/FE_DEPLOYMENT_PLAN.md)');
    });

    it('should return frontend documentation for frontend project', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      const docs = getSystemArchitectureDocs('frontend');

      expect(docs).toHaveLength(3);
      expect(docs).toContain('- [Frontend Architecture](../docs/architecture/frontend.md)');
    });

    it('should return worker documentation for job-finder-worker project', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      const docs = getSystemArchitectureDocs('job-finder-worker');

      expect(docs).toHaveLength(3);
      expect(docs).toContain('- [Worker Architecture](../docs/architecture/worker.md)');
      expect(docs).toContain('- [Worker Docker Development](../docs/development/WORKER_DOCKER_DEV.md)');
      expect(docs).toContain('- [Worker Analysis](../docs/development/WORKFLOW_ANALYSIS_WORKER.md)');
    });

    it('should return worker documentation for worker project', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      const docs = getSystemArchitectureDocs('worker');

      expect(docs).toHaveLength(3);
      expect(docs).toContain('- [Worker Architecture](../docs/architecture/worker.md)');
    });

    it('should return dev-monitor documentation for dev-monitor project', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      const docs = getSystemArchitectureDocs('dev-monitor');

      expect(docs).toHaveLength(4);
      expect(docs).toContain('- [Dev Monitor Requirements](../docs/development/DEV_MONITOR_REQUIREMENTS.md)');
      expect(docs).toContain('- [Dev Monitor UI Proposal](../docs/development/DEV_MANAGEMENT_UI_PROPOSAL.md)');
      expect(docs).toContain('- [Logging Architecture](../docs/operations/logging-architecture.md)');
      expect(docs).toContain('- [Structured Logging Migration](../docs/operations/STRUCTURED_LOGGING_MIGRATION.md)');
    });

    it('should return shared-types documentation for job-finder-shared-types project', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      const docs = getSystemArchitectureDocs('job-finder-shared-types');

      expect(docs).toHaveLength(2);
      expect(docs).toContain('- [Shared Types Documentation](../docs/development/NPM_PUBLISHING_SETUP.md)');
      expect(docs).toContain('- [Package Management](../docs/development/MCP_SERVER_RECOMMENDATIONS.md)');
    });

    it('should return shared-types documentation for shared-types project', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      const docs = getSystemArchitectureDocs('shared-types');

      expect(docs).toHaveLength(2);
      expect(docs).toContain('- [Shared Types Documentation](../docs/development/NPM_PUBLISHING_SETUP.md)');
    });

    it('should return generic documentation for unknown projects', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      const docs = getSystemArchitectureDocs('unknown-project');

      expect(docs).toHaveLength(2);
      expect(docs).toContain('- [System Architecture Overview](../docs/architecture/system-overview.md)');
      expect(docs).toContain('- [Architecture Reality](../docs/architecture/architecture-reality.md)');
    });
  });

  describe('Case Insensitive Matching', () => {
    it('should handle uppercase project names', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      
      const testCases = [
        'JOB-FINDER-BE',
        'JOB-FINDER-FE', 
        'JOB-FINDER-WORKER',
        'DEV-MONITOR',
        'JOB-FINDER-SHARED-TYPES'
      ];

      testCases.forEach(project => {
        const docs = getSystemArchitectureDocs(project);
        expect(docs.length).toBeGreaterThan(0);
        expect(docs[0]).toContain('- [');
      });
    });

    it('should handle mixed case project names', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      
      const testCases = [
        'Job-Finder-BE',
        'Job-Finder-FE',
        'Job-Finder-Worker',
        'Dev-Monitor',
        'Job-Finder-Shared-Types'
      ];

      testCases.forEach(project => {
        const docs = getSystemArchitectureDocs(project);
        expect(docs.length).toBeGreaterThan(0);
        expect(docs[0]).toContain('- [');
      });
    });

    it('should handle lowercase project names', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      
      const testCases = [
        'job-finder-be',
        'job-finder-fe',
        'job-finder-worker',
        'dev-monitor',
        'job-finder-shared-types'
      ];

      testCases.forEach(project => {
        const docs = getSystemArchitectureDocs(project);
        expect(docs.length).toBeGreaterThan(0);
        expect(docs[0]).toContain('- [');
      });
    });
  });

  describe('Documentation Link Format', () => {
    it('should return properly formatted markdown links', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      const docs = getSystemArchitectureDocs('job-finder-BE');

      docs.forEach((doc: any) => {
        // Each doc should be a markdown list item with a link
        expect(doc).toMatch(/^- \[.+\]\(.+\)$/);
        expect(doc).toContain('../docs/');
      });
    });

    it('should have consistent relative path structure', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      const docs = getSystemArchitectureDocs('job-finder-BE');

      docs.forEach((doc: any) => {
        // All paths should be relative and start with ../
        expect(doc).toContain('../docs/');
        expect(doc).not.toContain('http://');
        expect(doc).not.toContain('https://');
        expect(doc).not.toContain('/home/');
        expect(doc).not.toContain('C:\\');
      });
    });

    it('should have valid markdown link syntax', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      const docs = getSystemArchitectureDocs('job-finder-BE');

      docs.forEach((doc: any) => {
        // Should match markdown link pattern: - [text](path)
        expect(doc).toMatch(/^- \[.+\]\(.+\)$/);
        
        // Should not have empty text or path
        const linkMatch = doc.match(/^- \[(.+)\]\((.+)\)$/);
        expect(linkMatch).toBeTruthy();
        expect(linkMatch![1].trim()).not.toBe('');
        expect(linkMatch![2].trim()).not.toBe('');
      });
    });
  });

  describe('Documentation Coverage', () => {
    it('should provide comprehensive documentation for backend projects', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      const docs = getSystemArchitectureDocs('job-finder-BE');

      // Should cover architecture, database, deployment, and setup
      const docText = docs.join(' ');
      expect(docText).toContain('Architecture');
      expect(docText).toContain('Database');
      expect(docText).toContain('Firebase');
      expect(docText).toContain('Firestore');
    });

    it('should provide comprehensive documentation for frontend projects', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      const docs = getSystemArchitectureDocs('job-finder-FE');

      // Should cover architecture, development, and deployment
      const docText = docs.join(' ');
      expect(docText).toContain('Architecture');
      expect(docText).toContain('Development');
      expect(docText).toContain('Deployment');
    });

    it('should provide comprehensive documentation for worker projects', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      const docs = getSystemArchitectureDocs('job-finder-worker');

      // Should cover architecture, development, and analysis
      const docText = docs.join(' ');
      expect(docText).toContain('Architecture');
      expect(docText).toContain('Development');
      expect(docText).toContain('Analysis');
    });

    it('should provide comprehensive documentation for dev-monitor projects', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      const docs = getSystemArchitectureDocs('dev-monitor');

      // Should cover requirements, UI, logging, and migration
      const docText = docs.join(' ');
      expect(docText).toContain('Requirements');
      expect(docText).toContain('UI');
      expect(docText).toContain('Logging');
      expect(docText).toContain('Migration');
    });
  });

  describe('Regression Prevention', () => {
    it('should maintain consistent documentation structure', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      
      const projects = ['job-finder-BE', 'job-finder-FE', 'job-finder-worker', 'dev-monitor'];
      
      projects.forEach(project => {
        const docs = getSystemArchitectureDocs(project);
        
        // Each project should have at least 2 documentation links
        expect(docs.length).toBeGreaterThanOrEqual(2);
        
        // All docs should be properly formatted
        docs.forEach((doc: any) => {
          expect(doc).toMatch(/^- \[.+\]\(.+\)$/);
          expect(doc).toContain('../docs/');
        });
      });
    });

    it('should not include duplicate documentation links', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      const docs = getSystemArchitectureDocs('job-finder-BE');

      // Check for duplicates
      const uniqueDocs = new Set(docs);
      expect(uniqueDocs.size).toBe(docs.length);
    });

    it('should maintain backward compatibility for existing projects', () => {
      const getSystemArchitectureDocs = (templateManager as any).getSystemArchitectureDocs.bind(templateManager);
      
      // Test that existing project names still work
      const existingProjects = [
        'job-finder-BE',
        'job-finder-FE', 
        'job-finder-worker',
        'dev-monitor',
        'job-finder-shared-types'
      ];

      existingProjects.forEach(project => {
        const docs = getSystemArchitectureDocs(project);
        expect(docs.length).toBeGreaterThan(0);
      });
    });
  });
});

