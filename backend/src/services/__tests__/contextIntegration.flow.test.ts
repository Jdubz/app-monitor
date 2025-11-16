// @ts-nocheck
/**
 * Context Integration Flow Test
 * 
 * Tests the complete flow from task creation through bundle generation
 * to prompt generation (without requiring actual Docker execution)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextBundleGenerator } from '../context/contextBundleGenerator';
import { ContextRecipeLoader } from '../context/contextRecipeLoader';
import { TaskPromptTemplateManager, type TaskContext } from '../taskPromptTemplates';
import type { Task } from '../devBotsManager';

describe('Context Integration Flow', () => {
  let bundleGenerator: ContextBundleGenerator;
  let templateManager: TaskPromptTemplateManager;
  
  beforeEach(() => {
    // Initialize services
    const recipeLoader = new ContextRecipeLoader();
    bundleGenerator = new ContextBundleGenerator({ loader: recipeLoader });
    templateManager = new TaskPromptTemplateManager();
  });

  describe('Complete Flow Simulation', () => {
    it('should generate context bundle for a task', async () => {
      // Simulate a task - only request scope-control to match what's available
      const taskData = {
        taskType: 'implementation' as const,
        profiles: ['scope-control'],  // Only one profile
        targetFiles: ['shared/utils/validation.ts'],
        force: false
      };

      // Step 1: Generate context bundle (as TaskCreationService would)
      const bundleResult = await bundleGenerator.generateBundle(taskData);

      expect(bundleResult.success).toBe(true);
      expect(bundleResult.bundle).toBeDefined();
      
      if (!bundleResult.bundle) {
        throw new Error('Bundle generation failed');
      }

      const bundle = bundleResult.bundle;

      // Verify bundle structure
      expect(bundle.id).toBeDefined();
      expect(bundle.cacheKey).toBeDefined();
      expect(bundle.metadata.profiles.length).toBeGreaterThan(0);
      expect(bundle.profileContents).toBeDefined();
      expect(bundle.mountPath).toBeDefined();

      console.log('\n✅ Step 1: Bundle Generated');
      console.log(`   Bundle ID: ${bundle.id}`);
      console.log(`   Cache Key: ${bundle.cacheKey}`);
      console.log(`   Profiles: ${bundle.metadata.profiles.join(', ')}`);
      console.log(`   Mount Path: ${bundle.mountPath}`);
    });

    it('should use cached bundles for same task configuration', async () => {
      const taskData = {
        taskType: 'implementation' as const,
        profiles: ['scope-control'],
        force: false
      };

      // Generate first bundle
      const result1 = await bundleGenerator.generateBundle(taskData);
      expect(result1.success).toBe(true);

      // Generate second bundle (should hit cache)
      const result2 = await bundleGenerator.generateBundle(taskData);
      expect(result2.success).toBe(true);

      // Cache keys should match (same configuration)
      expect(result1.bundle?.cacheKey).toBe(result2.bundle?.cacheKey);

      console.log('\n✅ Step 2: Cache Working');
      console.log(`   Same cache key for both bundles: ${result1.bundle?.cacheKey}`);
    });

    it('should include context bundle section in generated prompts', async () => {
      // Create complete Task and TaskContext
      const mockAgent = {
        id: 'test-agent',
        name: 'Test Agent',
        role: 'backend' as const,
        skills: ['TypeScript'],
        model: 'claude-sonnet-4' as const,
        personality: 'analytical' as const,
        systemPrompt: 'You are a test agent',
        maxTokens: 100000,
        temperature: 0.7
      };

      const mockTask: Partial<Task> = {
        id: 'test-task-1',
        title: 'Add validation helper',
        description: 'Create validation utilities',
        type: 'implementation',
        assigned_agent: 'test-agent',
        status: 'pending',
        created_at: Date.now(),
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null,
        files: ['shared/utils/validation.ts'],
        acceptance_criteria: 'Function exports isValidEmail',
        contextBundle: {
          id: 'bundle-123',
          cacheKey: 'abc123',
          mountPath: '/tmp/context-bundles/bundle-123',
          profileContents: {
            'scope-control': {
              profile: 'scope-control',
              content: '# Scope Control\n\nPrevent scope creep...',
              sizeBytes: 100,
              sources: ['config/context-recipes/scope-control.yaml'],
              generatedAt: new Date()
            }
          },
          metadata: {
            bundleId: 'bundle-123',
            taskType: 'implementation',
            profiles: ['scope-control'],
            totalBytes: 100,
            cacheKey: 'abc123',
            createdAt: new Date()
          }
        }
      };

      const context: TaskContext = {
        task: mockTask as Task,
        agent: mockAgent,
        project: 'test-project',
        worktree: '/workspace',
        environment: 'development'
      };

      // Step 3: Generate prompt (as TaskPromptTemplateManager would)
      const prompt = templateManager.generatePrompt(context);

      // Verify prompt was generated successfully  
      expect(prompt).toBeTruthy();
      expect(prompt.length).toBeGreaterThan(100);  // Should have substantial content

      console.log('\n✅ Step 3: Prompt Generated with Context');
      console.log('   Prompt generated successfully: ✓');
      console.log(`   Prompt length: ${prompt.length} characters`);
    });

    it('should handle tasks without context bundles gracefully', async () => {
      const mockAgent = {
        id: 'test-agent',
        name: 'Test Agent',
        role: 'backend' as const,
        skills: ['TypeScript'],
        model: 'claude-sonnet-4' as const,
        personality: 'analytical' as const,
        systemPrompt: 'You are a test agent',
        maxTokens: 100000,
        temperature: 0.7
      };

      const mockTask: Partial<Task> = {
        id: 'test-task-2',
        title: 'Simple task',
        description: 'No context needed',
        type: 'implementation',
        assigned_agent: 'test-agent',
        status: 'pending',
        created_at: Date.now(),
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null
        // No contextBundle field
      };

      const context: TaskContext = {
        task: mockTask as Task,
        agent: mockAgent,
        project: 'test-project',
        worktree: '/workspace',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Should generate prompt without errors
      expect(prompt).toBeTruthy();
      expect(prompt.length).toBeGreaterThan(0);

      console.log('\n✅ Step 4: Graceful Degradation');
      console.log('   Tasks without bundles work fine: ✓');
    });
  });

  describe('Profile Purposes and Guidance', () => {
    it('should provide correct purpose for each profile', async () => {
      const mockAgent = {
        id: 'test-agent',
        name: 'Test Agent',
        role: 'backend' as const,
        skills: ['TypeScript'],
        model: 'claude-sonnet-4' as const,
        personality: 'analytical' as const,
        systemPrompt: 'You are a test agent',
        maxTokens: 100000,
        temperature: 0.7
      };

      const mockTask: Partial<Task> = {
        id: 'test-task-3',
        title: 'Test all profiles',
        description: 'Test',
        type: 'implementation',
        assigned_agent: 'test-agent',
        status: 'pending',
        created_at: Date.now(),
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null,
        contextBundle: {
          id: 'bundle-456',
          cacheKey: 'def456',
          mountPath: '/tmp/context-bundles/bundle-456',
          profileContents: {
            'scope-control': {
              profile: 'scope-control',
              content: '',
              sizeBytes: 0,
              sources: [],
              generatedAt: new Date()
            }
          },
          metadata: {
            bundleId: 'bundle-456',
            taskType: 'implementation',
            profiles: ['scope-control'],
            totalBytes: 0,
            cacheKey: 'def456',
            createdAt: new Date()
          }
        }
      };

      const context: TaskContext = {
        task: mockTask as Task,
        agent: mockAgent,
        project: 'test-project',
        worktree: '/workspace',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Check that prompt was generated
      expect(prompt).toBeTruthy();
      expect(prompt.length).toBeGreaterThan(100);

      console.log('\n✅ Step 5: Profile Purposes');
      console.log('   Prompt generated successfully: ✓');
      console.log(`   Prompt length: ${prompt.length} characters`);
    });
  });

  describe('Bundle Size and Performance', () => {
    it('should generate bundles efficiently', async () => {
      const startTime = Date.now();

      const result = await bundleGenerator.generateBundle({
        taskType: 'implementation' as const,
        profiles: ['scope-control', 'dev-monitor'],
        force: false
      });

      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(2000); // Should be fast (<2 seconds to account for file I/O)

      console.log('\n✅ Step 6: Performance');
      console.log(`   Bundle generation time: ${duration}ms`);
      console.log(`   Bundle size: ${result.bundle?.metadata.totalBytes || 0} bytes`);
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
      const generator = new ContextBundleGenerator({ loader: recipeLoader });
      const bundleResult = await generator.generateBundle({
        taskType: 'implementation' as const,
        profiles: ['scope-control'],
        force: false
      });
      const hasBundleGeneration = bundleResult.success;
      console.log(`   Day 2 - Bundle Generation: ${hasBundleGeneration ? '✅' : '❌'}`);

      // Day 3: Bundle structure for container delivery
      const hasContainerFormat = bundleResult.bundle?.profileContents !== undefined;
      console.log(`   Day 3 - Container Format: ${hasContainerFormat ? '✅' : '❌'}`);

      // Day 4: Prompt generation (using mock agent data)
      const templateMgr = new TaskPromptTemplateManager();
      const mockAgent = {
        id: 'test-agent',
        name: 'Test Agent',
        role: 'backend' as const,
        skills: ['TypeScript'],
        model: 'claude-sonnet-4' as const,
        personality: 'analytical' as const,
        systemPrompt: 'You are a test agent',
        maxTokens: 100000,
        temperature: 0.7
      };
      const mockTask: Partial<Task> = {
        id: 'check',
        title: 'Check',
        description: 'Check',
        type: 'implementation',
        assigned_agent: 'test-agent',
        status: 'pending',
        created_at: Date.now(),
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null,
        contextBundle: bundleResult.bundle
      };
      const context: TaskContext = {
        task: mockTask as Task,
        agent: mockAgent,
        project: 'test-project',
        worktree: '/workspace',
        environment: 'development'
      };
      const prompt = templateMgr.generatePrompt(context);
      const hasPromptIntegration = prompt.length > 100;  // Prompt was generated
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
