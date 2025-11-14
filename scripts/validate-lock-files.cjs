#!/usr/bin/env node
/**
 * Validates package-lock.json files are in sync with package.json
 * Runs as part of pre-commit and CI pipeline
 *
 * For npm workspaces, validates the root package-lock.json which manages
 * all workspace dependencies.
 *
 * Exit codes:
 *   0 - All lock files valid
 *   1 - One or more lock files out of sync
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let hasErrors = false;

console.log('🔍 Validating package-lock.json files...\n');

// Check if this is an npm workspace project
const rootPackageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const isWorkspace = rootPackageJson.workspaces && rootPackageJson.workspaces.length > 0;

if (isWorkspace) {
  console.log('📦 Detected npm workspaces project');
  console.log(`   Workspaces: ${rootPackageJson.workspaces.join(', ')}\n`);

  // For workspaces, only validate the root package-lock.json
  console.log('Checking root package-lock.json...');

  if (!fs.existsSync('package-lock.json')) {
    console.error('❌ root: Missing package-lock.json');
    console.error('   Run: npm install');
    hasErrors = true;
  } else {
    // Validate lock file is in sync
    try {
      execSync('npm ci --dry-run', {
        stdio: 'pipe',
        encoding: 'utf8'
      });
      console.log('✅ root: Lock file valid (includes all workspace dependencies)');
    } catch (error) {
      console.error('❌ root: Lock file out of sync with package.json');
      console.error('   Run: npm install');

      // Try to extract specific errors
      const errorOutput = error.stderr || error.stdout || '';
      const missingMatch = errorOutput.match(/Missing: ([^\n]+)/);
      const invalidMatch = errorOutput.match(/Invalid: ([^\n]+)/);

      if (missingMatch) {
        console.error(`   Missing dependencies: ${missingMatch[1]}`);
      }
      if (invalidMatch) {
        console.error(`   Version mismatches: ${invalidMatch[1]}`);
      }

      hasErrors = true;
    }
  }
} else {
  // Non-workspace project - check root only
  console.log('Checking package-lock.json...');

  if (!fs.existsSync('package-lock.json')) {
    console.error('❌ Missing package-lock.json');
    console.error('   Run: npm install');
    hasErrors = true;
  } else {
    try {
      execSync('npm ci --dry-run', {
        stdio: 'pipe',
        encoding: 'utf8'
      });
      console.log('✅ Lock file valid');
    } catch (error) {
      console.error('❌ Lock file out of sync with package.json');
      console.error('   Run: npm install');

      const errorOutput = error.stderr || error.stdout || '';
      const missingMatch = errorOutput.match(/Missing: ([^\n]+)/);
      const invalidMatch = errorOutput.match(/Invalid: ([^\n]+)/);

      if (missingMatch) {
        console.error(`   Missing dependencies: ${missingMatch[1]}`);
      }
      if (invalidMatch) {
        console.error(`   Version mismatches: ${invalidMatch[1]}`);
      }

      hasErrors = true;
    }
  }
}

console.log('');

if (hasErrors) {
  console.error('❌ Lock file validation failed');
  console.error('\n📋 How to fix:');
  console.error('  1. Run: npm install');
  console.error('  2. Commit the updated package-lock.json file');
  console.error('  3. Ensure package.json and package-lock.json are committed together\n');
  process.exit(1);
}

console.log('✅ All package-lock.json files are valid\n');
process.exit(0);
