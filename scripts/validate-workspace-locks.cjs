#!/usr/bin/env node
/**
 * Validates that each workspace's package-lock.json is in sync with package.json
 *
 * CRITICAL: This script simulates the production deployment process, which
 * temporarily removes the root package.json to prevent workspace resolution.
 *
 * This catches issues where:
 * - Root package-lock.json is valid (workspace resolution works)
 * - Workspace package-lock.json is out of sync (deployment fails)
 *
 * Run this in CI for PRs to main to prevent deployment failures.
 *
 * Exit codes:
 *   0 - All workspace lock files valid
 *   1 - One or more workspace lock files out of sync
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Validating workspace package-lock.json files...\n');

// Read workspace configuration
const rootPackageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

if (!rootPackageJson.workspaces || rootPackageJson.workspaces.length === 0) {
  console.log('ℹ️  Not a workspace project, skipping validation');
  process.exit(0);
}

const workspaces = rootPackageJson.workspaces;
console.log(`📦 Workspaces: ${workspaces.join(', ')}\n`);

let hasErrors = false;
const results = [];

// Temporary backup name for root package.json
const ROOT_PKG = 'package.json';
const ROOT_PKG_BACKUP = '.package.json.workspace-validation-backup';

// Ensure cleanup on exit
process.on('exit', () => {
  if (fs.existsSync(ROOT_PKG_BACKUP)) {
    fs.renameSync(ROOT_PKG_BACKUP, ROOT_PKG);
  }
});

process.on('SIGINT', () => {
  process.exit(1);
});

for (const workspace of workspaces) {
  const workspacePath = workspace;
  const packageJsonPath = path.join(workspacePath, 'package.json');
  const lockFilePath = path.join(workspacePath, 'package-lock.json');

  // Skip if workspace doesn't have package.json (like empty directories)
  if (!fs.existsSync(packageJsonPath)) {
    console.log(`⏭️  ${workspace}: No package.json, skipping`);
    continue;
  }

  // Check if workspace has any dependencies
  const workspacePackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const hasDependencies =
    (workspacePackageJson.dependencies && Object.keys(workspacePackageJson.dependencies).length > 0) ||
    (workspacePackageJson.devDependencies && Object.keys(workspacePackageJson.devDependencies).length > 0) ||
    (workspacePackageJson.peerDependencies && Object.keys(workspacePackageJson.peerDependencies).length > 0) ||
    (workspacePackageJson.optionalDependencies && Object.keys(workspacePackageJson.optionalDependencies).length > 0);

  if (!hasDependencies) {
    console.log(`⏭️  ${workspace}: No dependencies, skipping lock file validation`);
    continue;
  }

  // Check if lock file exists
  if (!fs.existsSync(lockFilePath)) {
    console.error(`❌ ${workspace}: Missing package-lock.json`);
    console.error(`   Lock file required: ${lockFilePath}`);
    console.error(`   Run: cd ${workspace} && npm install\n`);
    hasErrors = true;
    results.push({ workspace, status: 'missing-lock', valid: false });
    continue;
  }

  // Simulate deployment process: temporarily hide root package.json
  // This forces npm to resolve dependencies without workspace context,
  // exactly as the deployment script does
  console.log(`🧪 ${workspace}: Simulating deployment (without workspace context)...`);

  try {
    // Backup root package.json
    if (fs.existsSync(ROOT_PKG)) {
      fs.renameSync(ROOT_PKG, ROOT_PKG_BACKUP);
    }

    // Test npm ci in the workspace directory without workspace context
    const output = execSync(`cd ${workspacePath} && npm ci --dry-run`, {
      stdio: 'pipe',
      encoding: 'utf8',
      env: { ...process.env, npm_config_package_lock: 'true' }
    });

    // Restore root package.json
    if (fs.existsSync(ROOT_PKG_BACKUP)) {
      fs.renameSync(ROOT_PKG_BACKUP, ROOT_PKG);
    }

    console.log(`✅ ${workspace}: Lock file valid (deployment would succeed)\n`);
    results.push({ workspace, status: 'valid', valid: true });

  } catch (error) {
    // Restore root package.json on error
    if (fs.existsSync(ROOT_PKG_BACKUP)) {
      fs.renameSync(ROOT_PKG_BACKUP, ROOT_PKG);
    }

    console.error(`❌ ${workspace}: Lock file OUT OF SYNC (deployment would FAIL)`);
    console.error(`   This is the EXACT error that would occur in production!\n`);

    // Extract helpful error details
    const errorOutput = error.stderr || error.stdout || '';
    const lines = errorOutput.split('\n');

    // Look for missing packages
    const missingPackages = [];
    let inErrorSection = false;

    for (const line of lines) {
      if (line.includes('Missing:')) {
        const match = line.match(/Missing:\s+(.+)/);
        if (match) {
          missingPackages.push(match[1]);
        }
      }
      if (line.includes('npm error') || line.includes('npm ERR!')) {
        inErrorSection = true;
      }
      if (inErrorSection && line.trim() && !line.includes('npm error') && !line.includes('npm ERR!')) {
        // Likely an important error message
        if (line.includes('out of sync') || line.includes('Missing:')) {
          console.error(`   ${line.trim()}`);
        }
      }
    }

    if (missingPackages.length > 0) {
      console.error(`   Missing from lock file:`);
      missingPackages.forEach(pkg => console.error(`     - ${pkg}`));
    }

    console.error(`\n   📝 To fix:`);
    console.error(`      cd ${workspace}`);
    console.error(`      npm install`);
    console.error(`      git add package-lock.json`);
    console.error(`      git commit -m "fix: sync ${workspace}/package-lock.json"\n`);

    hasErrors = true;
    results.push({
      workspace,
      status: 'out-of-sync',
      valid: false,
      missingPackages
    });
  }
}

console.log('\n' + '='.repeat(60));

if (hasErrors) {
  console.error('\n❌ WORKSPACE LOCK FILE VALIDATION FAILED\n');

  const failedWorkspaces = results.filter(r => !r.valid);
  console.error(`Failed workspaces (${failedWorkspaces.length}):`);
  failedWorkspaces.forEach(r => {
    console.error(`  - ${r.workspace}: ${r.status}`);
  });

  console.error('\n⚠️  DEPLOYMENT WOULD FAIL IN PRODUCTION');
  console.error('   These lock files must be fixed before merging to main.\n');

  console.error('Why this matters:');
  console.error('  - CI validates the ROOT package-lock.json (which passes)');
  console.error('  - Deployment uses WORKSPACE package-lock.json (which fails)');
  console.error('  - This validation simulates the exact deployment process\n');

  process.exit(1);
}

console.log('\n✅ ALL WORKSPACE LOCK FILES VALID\n');
console.log('Deployment simulation passed for all workspaces.');
console.log('Lock files are in sync and ready for production.\n');
process.exit(0);
