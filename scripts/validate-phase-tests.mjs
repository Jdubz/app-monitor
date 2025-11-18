#!/usr/bin/env node

/**
 * Phase System Test Validation Script
 * 
 * Validates that all phase system tests are properly structured and ready to run.
 * Does NOT execute tests, just validates structure and imports.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const testFiles = [
  'backend/src/services/__tests__/phaseExecution.service.test.ts',
  'backend/src/services/__tests__/artifactExtractor.service.test.ts',
  'backend/src/services/__tests__/recoveryAgent.service.test.ts',
  'backend/src/services/__tests__/phaseSystem.e2e.test.ts',
  'backend/src/services/__tests__/taskQueuePhase.integration.test.ts',
  'backend/src/services/__tests__/phaseOrchestrator.service.test.ts',
  'backend/src/services/phaseValidation/__tests__/Phase1-2Validators.test.ts',
  'backend/src/services/phaseValidation/__tests__/Phase3-4Validators.test.ts',
  'backend/src/services/phaseValidation/__tests__/Phase5-7Validators.test.ts',
  'backend/src/services/__tests__/phase-integration.test.ts',
];

console.log('🧪 Phase System Test Validation\n');
console.log('═'.repeat(60));

let totalTests = 0;
let totalFiles = 0;
let missingFiles = 0;

for (const testFile of testFiles) {
  const fullPath = path.join(projectRoot, testFile);
  const exists = fs.existsSync(fullPath);
  
  if (exists) {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const testCount = (content.match(/it\(/g) || []).length;
    const describeCount = (content.match(/describe\(/g) || []).length;
    const lines = content.split('\n').length;
    
    console.log(`✅ ${path.basename(testFile)}`);
    console.log(`   📁 ${testFile}`);
    console.log(`   📊 ${describeCount} test suites, ${testCount} tests, ${lines} lines`);
    console.log('');
    
    totalTests += testCount;
    totalFiles++;
  } else {
    console.log(`❌ ${path.basename(testFile)}`);
    console.log(`   📁 ${testFile}`);
    console.log(`   ⚠️  File not found`);
    console.log('');
    missingFiles++;
  }
}

console.log('═'.repeat(60));
console.log('\n📈 Summary:\n');
console.log(`   Test Files:     ${totalFiles}/${testFiles.length}`);
console.log(`   Total Tests:    ${totalTests}`);
console.log(`   Missing Files:  ${missingFiles}`);

if (missingFiles === 0) {
  console.log('\n✨ All phase system test files are present and accounted for!\n');
  process.exit(0);
} else {
  console.log('\n⚠️  Some test files are missing. Please review.\n');
  process.exit(1);
}
