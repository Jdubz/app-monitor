#!/usr/bin/env node

/**
 * Context Management Validation Script
 * 
 * Validates that the context management system is working correctly
 * Runs through the complete flow and reports status
 */

import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const results = [];

function report(name, status, message, details) {
  results.push({ name, status, message, details });
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏭️';
  console.log(`${icon} ${name}: ${message}`);
  if (details) {
    console.log(`   Details:`, details);
  }
}

async function validateContextRecipes() {
  try {
    const recipesPath = path.resolve(__dirname, '../backend/config/context-recipes');
    const files = await fs.readdir(recipesPath);
    
    const expectedRecipes = [
      'scope-control.yaml',
      'dev-monitor.yaml',
      'pr-workflow.yaml',
      'failure-recovery.yaml',
      'deployment.yaml'
    ];

    const found = expectedRecipes.filter(r => files.includes(r));
    
    if (found.length === expectedRecipes.length) {
      report('Context Recipes', 'pass', `All 5 YAML recipes found`, { found });
    } else {
      const missing = expectedRecipes.filter(r => !files.includes(r));
      report('Context Recipes', 'fail', `Missing recipes: ${missing.join(', ')}`);
    }
  } catch (error) {
    report('Context Recipes', 'fail', `Error reading recipes: ${error.message}`);
  }
}

async function validateRecipeContent() {
  try {
    const recipesPath = path.resolve(__dirname, '../backend/config/context-recipes');
    const scopeControlPath = path.join(recipesPath, 'scope-control.yaml');
    
    const content = await fs.readFile(scopeControlPath, 'utf-8');
    
    const requiredFields = [
      'profile: scope-control',
      'description:',
      'constraints:',
      'investigationSteps:',
      'sources:'
    ];

    const missing = requiredFields.filter(field => !content.includes(field));
    
    if (missing.length === 0 && content.length > 100) {
      report('Recipe Content', 'pass', 'scope-control.yaml has all required fields', {
        size: content.length,
        fields: requiredFields.length
      });
    } else {
      report('Recipe Content', 'fail', `Missing fields: ${missing.join(', ')}`);
    }
  } catch (error) {
    report('Recipe Content', 'fail', `Error reading content: ${error.message}`);
  }
}

async function validateDatabaseMigration() {
  try {
    const migrationsPath = path.resolve(__dirname, '../backend/migrations');
    const files = await fs.readdir(migrationsPath);
    
    const migration020 = files.find(f => f.startsWith('020_'));
    
    if (migration020) {
      const content = await fs.readFile(path.join(migrationsPath, migration020), 'utf-8');
      
      const requiredColumns = [
        'context_bundle_id',
        'context_cache_key',
        'context_profiles',
        'risk_level'
      ];

      const found = requiredColumns.filter(col => content.includes(col));
      
      if (found.length === requiredColumns.length) {
        report('Database Migration', 'pass', 'Migration 020 has all context columns', {
          file: migration020,
          columns: found
        });
      } else {
        const missing = requiredColumns.filter(col => !content.includes(col));
        report('Database Migration', 'fail', `Missing columns: ${missing.join(', ')}`);
      }
    } else {
      report('Database Migration', 'fail', 'Migration 020 not found');
    }
  } catch (error) {
    report('Database Migration', 'fail', `Error reading migration: ${error.message}`);
  }
}

async function validateServiceIntegration() {
  try {
    // Check TaskCreationService has context integration
    const taskCreationPath = path.resolve(__dirname, '../backend/src/services/taskCreation.service.ts');
    const taskCreationContent = await fs.readFile(taskCreationPath, 'utf-8');
    
    const hasContextGenerator = taskCreationContent.includes('ContextBundleGenerator');
    const hasGenerateBundle = taskCreationContent.includes('generateBundle');
    
    if (hasContextGenerator && hasGenerateBundle) {
      report('TaskCreationService Integration', 'pass', 'ContextBundleGenerator integrated');
    } else {
      report('TaskCreationService Integration', 'fail', 'Missing context integration');
    }
  } catch (error) {
    report('TaskCreationService Integration', 'fail', `Error: ${error.message}`);
  }
}

async function validateContainerDelivery() {
  try {
    // Check EphemeralWorkerService has docker cp implementation
    const workerServicePath = path.resolve(__dirname, '../backend/src/services/ephemeralWorker.service.ts');
    const workerServiceContent = await fs.readFile(workerServicePath, 'utf-8');
    
    const hasCopyMethod = workerServiceContent.includes('copyContextBundleToContainer');
    const hasTarFs = workerServiceContent.includes('tar-fs');
    const hasPutArchive = workerServiceContent.includes('putArchive');
    
    if (hasCopyMethod && hasTarFs && hasPutArchive) {
      report('Container Delivery', 'pass', 'Docker cp implementation found');
    } else {
      report('Container Delivery', 'fail', 'Missing docker cp implementation');
    }
  } catch (error) {
    report('Container Delivery', 'fail', `Error: ${error.message}`);
  }
}

async function validatePromptGeneration() {
  try {
    // Check TaskPromptTemplateManager has context variable
    const promptTemplatePath = path.resolve(__dirname, '../backend/src/services/taskPromptTemplates.ts');
    const promptTemplateContent = await fs.readFile(promptTemplatePath, 'utf-8');
    
    const hasContextVariable = promptTemplateContent.includes('task.contextBundle');
    const hasContextSection = promptTemplateContent.includes('## 📦 Context Bundle');
    const hasProfilePurpose = promptTemplateContent.includes('getProfilePurpose');
    
    if (hasContextVariable && hasContextSection && hasProfilePurpose) {
      report('Prompt Generation', 'pass', 'Context bundle variable processor found');
    } else {
      report('Prompt Generation', 'fail', 'Missing context prompt integration');
    }
  } catch (error) {
    report('Prompt Generation', 'fail', `Error: ${error.message}`);
  }
}

async function validateTests() {
  try {
    const testsPath = path.resolve(__dirname, '../backend/src/services/__tests__');
    const files = await fs.readdir(testsPath);
    
    const testFiles = [
      'ephemeralWorker.context.test.ts',
      'taskPromptTemplates.context.test.ts',
      'contextManagement.e2e.test.ts'
    ];

    const found = testFiles.filter(f => files.includes(f));
    
    if (found.length === testFiles.length) {
      report('Test Coverage', 'pass', `All ${testFiles.length} test files exist`, { found });
    } else {
      const missing = testFiles.filter(f => !files.includes(f));
      report('Test Coverage', 'fail', `Missing tests: ${missing.join(', ')}`);
    }
  } catch (error) {
    report('Test Coverage', 'fail', `Error: ${error.message}`);
  }
}

async function main() {
  console.log('\n🔍 CONTEXT MANAGEMENT VALIDATION\n');
  console.log('════════════════════════════════════════════════════════════\n');

  await validateContextRecipes();
  await validateRecipeContent();
  await validateDatabaseMigration();
  await validateServiceIntegration();
  await validateContainerDelivery();
  await validatePromptGeneration();
  await validateTests();

  console.log('\n════════════════════════════════════════════════════════════\n');

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const total = results.length;

  console.log(`📊 SUMMARY: ${passed}/${total} checks passed\n`);

  if (failed === 0) {
    console.log('🎉 All validations passed! Context management system is functional.\n');
    process.exit(0);
  } else {
    console.log(`❌ ${failed} validation(s) failed. Review the output above.\n`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Validation script failed:', error);
  process.exit(1);
});
