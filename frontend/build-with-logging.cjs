#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('='.repeat(70));
console.log('🏗️  FRONTEND BUILD WITH ENVIRONMENT LOGGING');
console.log('='.repeat(70));

const rootDir = path.join(__dirname, '..');
const sharedEnvPath = path.join(rootDir, 'shared', '.env');
const isCI = process.env.CI === 'true';

console.log('\n📍 Build Location:');
console.log('  Working Directory:', process.cwd());
console.log('  Frontend Directory:', __dirname);
console.log('  Root Directory:', rootDir);
console.log('  Environment:', isCI ? 'CI (placeholder vars)' : 'Production/Dev');

console.log('\n🔍 Environment File Check:');
console.log('  Expected Path:', sharedEnvPath);

if (fs.existsSync(sharedEnvPath)) {
  console.log('  ✅ FOUND');
  
  // Load the env file
  console.log('  Loading variables with dotenv...');
  require('dotenv').config({ path: sharedEnvPath });
  console.log('  ✅ Loaded');
} else {
  if (isCI) {
    console.log('  ℹ️  Not found (expected in CI - using placeholder vars)');
  } else {
    console.log('  ❌ NOT FOUND (production builds need shared/.env!)');
  }
}

// Sensitive variables to mask in logs
const SENSITIVE_VARS = ['VITE_API_KEY', 'VITE_PASSWORD'];

console.log('\n🔑 VITE_* Variables to be embedded:');
const viteEnvVars = Object.keys(process.env)
  .filter(key => key.startsWith('VITE_'))
  .sort();

if (viteEnvVars.length > 0) {
  viteEnvVars.forEach(key => {
    const value = process.env[key];
    if (SENSITIVE_VARS.includes(key) && value) {
      console.log(`  ${key}=${value.substring(0, 20)}... (${value.length} chars)`);
    } else {
      console.log(`  ${key}=${value || 'NOT SET'}`);
    }
  });
} else {
  console.log('  ⚠️  No VITE_* variables found!');
}

console.log('\n🔨 Running build: tsc && vite build');
console.log('='.repeat(70));

try {
  execSync('tsc && vite build', { 
    stdio: 'inherit',
    cwd: __dirname,
    env: process.env
  });
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ BUILD SUCCESSFUL');
  console.log('='.repeat(70));
  
  console.log('\n📦 Build Output:');
  const distPath = path.join(__dirname, 'dist');
  if (fs.existsSync(distPath)) {
    console.log('  Location:', distPath);
    
    // Verify API key presence if verification key is provided
    const verificationKey = process.env.PROD_API_KEY_FOR_VERIFICATION;
    
    if (verificationKey) {
      const assetsPath = path.join(distPath, 'assets');
      if (fs.existsSync(assetsPath)) {
        const jsFiles = fs.readdirSync(assetsPath).filter(f => f.endsWith('.js'));
        
        console.log('\n🔑 API Key Verification:');
        console.log(`  Checking ${jsFiles.length} JS files for production API key`);
        
        const filesWithKey = [];
        for (const file of jsFiles) {
          const bundlePath = path.join(assetsPath, file);
          const bundle = fs.readFileSync(bundlePath, 'utf8');
          if (bundle.includes(verificationKey)) {
            filesWithKey.push(file);
          }
        }
        
        if (filesWithKey.length > 0) {
          console.log(`  ✅ Production API key found in: ${filesWithKey.join(', ')}`);
        } else {
          console.log(`  ❌ Production API key NOT found in any bundle`);
          console.log('  ⚠️  Build may not have loaded .env correctly!');
        }
      }
    } else if (!isCI) {
      console.log('\n🔑 API Key Verification:');
      console.log('  ℹ️  Skipped: Set PROD_API_KEY_FOR_VERIFICATION to verify');
    }
  }
  
  console.log('\n' + '='.repeat(70));
  
} catch (error) {
  console.error('\n❌ BUILD FAILED:', error.message);
  process.exit(1);
}
# Trigger CI - 1763177687
