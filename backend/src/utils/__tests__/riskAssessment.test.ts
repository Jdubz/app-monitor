/**
 * Risk Assessment Utility Tests
 *
 * Tests centralized risk assessment logic for task creation
 */

import { describe, it, expect } from 'vitest';
import { inferRiskLevelFromFiles, determineRiskLevel, FILE_RISK_PATTERNS } from '../riskAssessment.js';

describe('Risk Assessment Utility', () => {
  describe('FILE_RISK_PATTERNS', () => {
    it('should have patterns for all risk levels', () => {
      const levels = new Set(FILE_RISK_PATTERNS.map(p => p.level));
      expect(levels).toContain('minimal');
      expect(levels).toContain('low');
      expect(levels).toContain('medium');
      expect(levels).toContain('high');
    });

    it('should have patterns that match expected files', () => {
      const dockerPattern = FILE_RISK_PATTERNS.find(p => p.pattern.test('docker/Dockerfile'));
      expect(dockerPattern?.level).toBe('high');

      const docsPattern = FILE_RISK_PATTERNS.find(p => p.pattern.test('docs/README.md'));
      expect(docsPattern?.level).toBe('minimal');
    });
  });

  describe('inferRiskLevelFromFiles', () => {
    it('should return "low" for empty file list', () => {
      const risk = inferRiskLevelFromFiles([]);
      expect(risk).toBe('low');
    });

    it('should return "high" for Docker files', () => {
      const risk = inferRiskLevelFromFiles(['docker/Dockerfile', 'docker/docker-compose.yml']);
      expect(risk).toBe('high');
    });

    it('should return "high" for migration files', () => {
      const risk = inferRiskLevelFromFiles(['backend/migrations/001-add-users.sql']);
      expect(risk).toBe('high');
    });

    it('should return "high" for secrets/credentials', () => {
      const risk = inferRiskLevelFromFiles(['config/.env', 'backend/secrets.json']);
      expect(risk).toBe('high');
    });

    it('should return "high" for deployment scripts', () => {
      const risk = inferRiskLevelFromFiles(['scripts/deploy.sh', 'scripts/production/rollback.sh']);
      expect(risk).toBe('high');
    });

    it('should return "medium" for backend services', () => {
      const risk = inferRiskLevelFromFiles(['backend/src/services/auth.service.ts']);
      expect(risk).toBe('medium');
    });

    it('should return "medium" for backend routes', () => {
      const risk = inferRiskLevelFromFiles(['backend/src/routes/api.routes.ts']);
      expect(risk).toBe('medium');
    });

    it('should return "medium" for database files', () => {
      const risk = inferRiskLevelFromFiles(['backend/src/database/schema.ts']);
      expect(risk).toBe('medium');
    });

    it('should return "low" for frontend components', () => {
      const risk = inferRiskLevelFromFiles(['frontend/src/components/Button.tsx']);
      expect(risk).toBe('low');
    });

    it('should return "low" for tests', () => {
      const risk = inferRiskLevelFromFiles(['frontend/src/components/Button.test.tsx']);
      expect(risk).toBe('low');
    });

    it('should return "minimal" for docs', () => {
      const risk = inferRiskLevelFromFiles(['docs/README.md', 'CONTRIBUTING.md']);
      expect(risk).toBe('minimal');
    });

    it('should return highest risk when mixed file types', () => {
      const risk = inferRiskLevelFromFiles([
        'docs/README.md',            // minimal
        'frontend/src/App.tsx',      // low
        'backend/src/services/api.ts', // medium
        'docker/Dockerfile'           // high
      ]);
      expect(risk).toBe('high');
    });

    it('should default to "low" for unrecognized files', () => {
      const risk = inferRiskLevelFromFiles(['some/random/file.xyz']);
      expect(risk).toBe('low');
    });
  });

  describe('determineRiskLevel', () => {
    describe('with simple complexity', () => {
      it('should match file-based risk for simple tasks', () => {
        expect(determineRiskLevel(['docs/README.md'], 'simple')).toBe('minimal');
        expect(determineRiskLevel(['frontend/src/App.tsx'], 'simple')).toBe('low');
        expect(determineRiskLevel(['backend/src/services/api.ts'], 'simple')).toBe('medium');
        expect(determineRiskLevel(['docker/Dockerfile'], 'simple')).toBe('high');
      });
    });

    describe('with medium complexity', () => {
      it('should match file-based risk for medium tasks', () => {
        expect(determineRiskLevel(['docs/README.md'], 'medium')).toBe('minimal');
        expect(determineRiskLevel(['frontend/src/App.tsx'], 'medium')).toBe('low');
        expect(determineRiskLevel(['backend/src/services/api.ts'], 'medium')).toBe('medium');
        expect(determineRiskLevel(['docker/Dockerfile'], 'medium')).toBe('high');
      });
    });

    describe('with complex complexity', () => {
      it('should upgrade risk by one level for complex tasks', () => {
        expect(determineRiskLevel(['docs/README.md'], 'complex')).toBe('low');  // minimal → low
        expect(determineRiskLevel(['frontend/src/App.tsx'], 'complex')).toBe('medium');  // low → medium
        expect(determineRiskLevel(['backend/src/services/api.ts'], 'complex')).toBe('medium');  // medium stays medium
        expect(determineRiskLevel(['docker/Dockerfile'], 'complex')).toBe('high');  // high stays high
      });
    });

    describe('with expert complexity', () => {
      it('should always upgrade risk for expert tasks', () => {
        expect(determineRiskLevel(['docs/README.md'], 'expert')).toBe('low');  // minimal → low
        expect(determineRiskLevel(['frontend/src/App.tsx'], 'expert')).toBe('medium');  // low → medium
        expect(determineRiskLevel(['backend/src/services/api.ts'], 'expert')).toBe('high');  // medium → high
        expect(determineRiskLevel(['docker/Dockerfile'], 'expert')).toBe('high');  // high stays high
      });
    });

    describe('edge cases', () => {
      it('should handle empty files with complexity', () => {
        expect(determineRiskLevel([], 'simple')).toBe('low');
        expect(determineRiskLevel([], 'expert')).toBe('medium');  // low → medium
      });

      it('should handle undefined complexity (defaults to simple)', () => {
        expect(determineRiskLevel(['backend/src/services/api.ts'])).toBe('medium');
      });

      it('should handle mixed complexity scenarios', () => {
        // Frontend with expert complexity = medium
        expect(determineRiskLevel(['frontend/src/components/Complex.tsx'], 'expert')).toBe('medium');

        // Backend service with expert complexity = high
        expect(determineRiskLevel(['backend/src/services/auth.service.ts'], 'expert')).toBe('high');
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should correctly assess risk for typical implementation task', () => {
      const files = [
        'backend/src/services/newFeature.service.ts',
        'backend/src/routes/newFeature.routes.ts',
        'backend/src/services/__tests__/newFeature.test.ts'
      ];

      // Medium risk (backend services) with medium complexity
      const risk = determineRiskLevel(files, 'medium');
      expect(risk).toBe('medium');
    });

    it('should correctly assess risk for bug fix task', () => {
      const files = ['frontend/src/components/BuggyComponent.tsx'];

      // Low risk (frontend) with simple complexity
      const risk = determineRiskLevel(files, 'simple');
      expect(risk).toBe('low');
    });

    it('should correctly assess risk for deployment task', () => {
      const files = [
        'docker/Dockerfile',
        'docker/docker-compose.yml',
        'scripts/deploy.sh'
      ];

      // High risk (docker + deployment scripts) regardless of complexity
      const risk = determineRiskLevel(files, 'simple');
      expect(risk).toBe('high');
    });

    it('should correctly assess risk for documentation task', () => {
      const files = [
        'docs/api/endpoints.md',
        'README.md',
        'CONTRIBUTING.md'
      ];

      // Minimal risk (all docs)
      const risk = determineRiskLevel(files, 'simple');
      expect(risk).toBe('minimal');
    });
  });
});
