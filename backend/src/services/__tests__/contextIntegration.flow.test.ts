/**
 * Context Integration Flow Test
 * 
 * Tests the complete flow from task creation through bundle generation
 * to prompt generation (without requiring actual Docker execution)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextBundleGenerator } from '../context/contextBundleGenerator';
import { ContextRecipeLoader } from '../context/contextRecipeLoader';
import { TaskPromptTemplateManager } from '../taskPromptTemplates';
import type { TaskData } from '../../types/task.types';

describe('Context Integration Flow', () => {
  let bundleGenerator: ContextBundleGenerator;
  let templateManager: TaskPromptTemplateManager;
  
  beforeEach(() => {
    // Initialize services
    const recipeLoader = new ContextRecipeLoader();
    bundleGenerator = new ContextBundleGenerator(recipeLoader);
    templateManager = new TaskPromptTemplateManager();
  });

  describe('Complete Flow Simulation', () => {
    it('should generate context bundle for a task', async () => {
      // Simulate a task
      const taskData = {
        title: 'Add validation helper to shared utilities',
        description: 'Create a simple validation helper function',
        taskType: 'implementation' as const,
        targetFiles: ['shared/utils/validation.ts'],
        acceptanceCriteria: [
          'validation.ts exports isValidEmail function',
          'Unit tests cover happy path and error cases'
        ]
      };

      // Step 1: Generate context bundle (as TaskCreationService would)
      const bundleResult = await bundleGenerator.generateBundle(
        ['scope-control', 'dev-monitor'],
        taskData
      );

      expect(bundleResult.success).toBe(true);
      expect(bundleResult.bundle).toBeDefined();
      
      if (!bundleResult.bundle) {
        throw new Error('Bundle generation failed');
      }

      const bundle = bundleResult.bundle;

      // Verify bundle structure
      expect(bundle.id).toBeDefined();
      expect(bundle.cacheKey).toBeDefined();
      expect(bundle.profiles).toHaveLength(2);
      expect(bundle.profiles).toContain('scope-control');
      expect(bundle.profiles).toContain('dev-monitor');
      expect(bundle.files).toBeDefined();
      expect(bundle.metadata.gitCommitHash).toBeDefined();

      console.log('\n✅ Step 1: Bundle Generated');
      console.log(`   Bundle ID: ${bundle.id}`);
      console.log(`   Cache Key: ${bundle.cacheKey}`);
      console.log(`   Profiles: ${bundle.profiles.join(', ')}`);
      console.log(`   Files: ${Object.keys(bundle.files).length}`);
    });

    it('should use cached bundles for same git commit', async () => {
      const profiles = ['scope-control', 'dev-monitor'];
      const taskData = {
        title: 'Test task',
        description: 'Test',
        taskType: 'implementation' as const
      };

      // Generate first bundle
      const result1 = await bundleGenerator.generateBundle(profiles, taskData);
      expect(result1.success).toBe(true);

      // Generate second bundle (should hit cache)
      const result2 = await bundleGenerator.generateBundle(profiles, taskData);
      expect(result2.success).toBe(true);

      // Cache keys should match (same git commit)
      expect(result1.bundle?.cacheKey).toBe(result2.bundle?.cacheKey);

      console.log('\n✅ Step 2: Cache Working');
      console.log(`   Same cache key for both bundles: ${result1.bundle?.cacheKey}`);
    });

    it('should include context bundle section in generated prompts', async () => {
      // Create a task with context bundle
      const task: Partial<TaskData> = {
        id: 'test-task-1',
        title: 'Add validation helper',
        description: 'Create validation utilities',
        taskType: 'implementation',
        targetFiles: ['shared/utils/validation.ts'],
        acceptanceCriteria: ['Function exports isValidEmail'],
        contextBundle: {
          id: 'bundle-123',
          cacheKey: 'abc123',
          profiles: ['scope-control', 'dev-monitor'],
          files: {
            'scope-control.md': '# Scope Control\n\nPrevent scope creep...',
            'dev-monitor.md': '# Dev Monitor\n\nBest practices...'
          },
          metadata: {
            gitCommitHash: 'abc123',
            generatedAt: new Date().toISOString(),
            profiles: ['scope-control', 'dev-monitor'],
            taskType: 'implementation'
          }
        }
      };

      // Step 3: Generate prompt (as TaskPromptTemplateManager would)
      const prompt = templateManager.generatePrompt(task as TaskData);

      // Verify prompt includes context section
      expect(prompt).toContain('## 📦 Context Bundle');
      expect(prompt).toContain('scope-control');
      expect(prompt).toContain('dev-monitor');
      expect(prompt).toContain('/workspace/context/');
      expect(prompt).toContain('**Purpose**:');
      expect(prompt).toContain('**When to Read**:');
      expect(prompt).toContain('Read BEFORE');

      console.log('\n✅ Step 3: Prompt Generated with Context');
      console.log('   Context section present: ✓');
      console.log('   File paths included: ✓');
      console.log('   Usage guidance included: ✓');

      // Extract context section for verification
      const contextSectionMatch = prompt.match(/## 📦 Context Bundle[\s\S]*?(?=\n## |$)/);
      if (contextSectionMatch) {
        console.log('\n📝 Context Section Preview:');
        console.log(contextSectionMatch[0].substring(0, 500) + '...');
      }
    });

    it('should handle tasks without context bundles gracefully', async () => {
      const task: Partial<TaskData> = {
        id: 'test-task-2',
        title: 'Simple task',
        description: 'No context needed',
        taskType: 'implementation',
        // No contextBundle field
      };

      const prompt = templateManager.generatePrompt(task as TaskData);

      // Should not include context section
      expect(prompt).not.toContain('## 📦 Context Bundle');

      console.log('\n✅ Step 4: Graceful Degradation');
      console.log('   Tasks without bundles work fine: ✓');
    });
  });

  describe('Profile Purposes and Guidance', () => {
    it('should provide correct purpose for each profile', async () => {
      const task: Partial<TaskData> = {
        id: 'test-task-3',
        title: 'Test all profiles',
        description: 'Test',
        taskType: 'implementation',
        contextBundle: {
          id: 'bundle-456',
          cacheKey: 'def456',
          profiles: ['scope-control', 'dev-monitor', 'pr-workflow', 'failure-recovery', 'deployment'],
          files: {
            'scope-control.md': '',
            'dev-monitor.md': '',
            'pr-workflow.md': '',
            'failure-recovery.md': '',
            'deployment.md': ''
          },
          metadata: {
            gitCommitHash: 'def456',
            generatedAt: new Date().toISOString(),
            profiles: ['scope-control', 'dev-monitor', 'pr-workflow', 'failure-recovery', 'deployment'],
            taskType: 'implementation'
          }
        }
      };

      const prompt = templateManager.generatePrompt(task as TaskData);

      // Check for expected purposes
      expect(prompt).toContain('Prevents scope creep');
      expect(prompt).toContain('Development best practices');
      expect(prompt).toContain('Git and PR workflow');
      expect(prompt).toContain('Error handling and recovery');
      expect(prompt).toContain('Deployment and production');

      console.log('\n✅ Step 5: Profile Purposes');
      console.log('   All 5 profiles have purposes: ✓');
      console.log('   Guidance text present: ✓');
    });
  });

  describe('Bundle Size and Performance', () => {
    it('should generate bundles efficiently', async () => {
      const startTime = Date.now();

      const result = await bundleGenerator.generateBundle(
        ['scope-control', 'dev-monitor'],
        {
          title: 'Performance test',
          description: 'Test bundle generation speed',
          taskType: 'implementation' as const
        }
      );

      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(1000); // Should be fast (<1 second)

      console.log('\n✅ Step 6: Performance');
      console.log(`   Bundle generation time: ${duration}ms`);
      console.log(`   Bundle size: ${result.bundle?.metadata.sizeBytes || 0} bytes`);
    });
  });

  describe('Integration Checklist', () => {
    it('validates all Days 1-5 deliverables are working', async () => {
      console.log('\n📋 INTEGRATION VALIDATION CHECKLIST\n');

      // Day 1: Context recipes and generator
      const recipeLoader = new ContextRecipeLoader();
      const allRecipes = await recipeLoader.loadAllRecipes();
      const hasAllRecipes = allRecipes.size >= 5;
      console.log(`   Day 1 - Context Recipes: ${hasAllRecipes ? '✅' : '❌'} (${allRecipes.size} recipes)`);

      // Day 2: Bundle generation
      const generator = new ContextBundleGenerator(recipeLoader);
      const bundleResult = await generator.generateBundle(['scope-control'], {
        title: 'Test',
        description: 'Test',
        taskType: 'implementation' as const
      });
      const hasBundleGeneration = bundleResult.success;
      console.log(`   Day 2 - Bundle Generation: ${hasBundleGeneration ? '✅' : '❌'}`);

      // Day 3: Bundle structure for container delivery
      const hasContainerFormat = bundleResult.bundle?.files !== undefined;
      console.log(`   Day 3 - Container Format: ${hasContainerFormat ? '✅' : '❌'}`);

      // Day 4: Prompt generation
      const templateMgr = new TaskPromptTemplateManager();
      const task: Partial<TaskData> = {
        id: 'check',
        title: 'Check',
        description: 'Check',
        taskType: 'implementation',
        contextBundle: bundleResult.bundle
      };
      const prompt = templateMgr.generatePrompt(task as TaskData);
      const hasPromptIntegration = prompt.includes('📦 Context Bundle');
      console.log(`   Day 4 - Prompt Integration: ${hasPromptIntegration ? '✅' : '❌'}`);

      // Day 5: This test itself
      console.log(`   Day 5 - Testing Infrastructure: ✅`);

      // All should pass
      expect(hasAllRecipes).toBe(true);
      expect(hasBundleGeneration).toBe(true);
      expect(hasContainerFormat).toBe(true);
      expect(hasPromptIntegration).toBe(true);

      console.log('\n🎉 All integration points validated!\n');
    });
  });
});
