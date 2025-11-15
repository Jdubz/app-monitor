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
console.log('  Environment:', isCI ? 'CI (using placeholder vars)' : 'Production/Dev');

console.log('\n🔍 Environment File Check:');
console.log('  Expected Path:', sharedEnvPath);

if (fs.existsSync(sharedEnvPath)) {
  console.log('  ✅ FOUND:', sharedEnvPath);
  const envContent = fs.readFileSync(sharedEnvPath, 'utf8');
  const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  
  console.log('\n📝 VITE_* Variables from .env:');
  const viteVars = envLines.filter(line => line.startsWith('VITE_'));
  if (viteVars.length > 0) {
    viteVars.forEach(line => {
      const [key, value] = line.split('=');
      if (key === 'VITE_API_KEY') {
        console.log(`  ${key}=${value ? value.substring(0, 20) + '...' : 'NOT SET'}`);
      } else {
        console.log(`  ${key}=${value || 'NOT SET'}`);
      }
    });
  } else {
    console.log('  ⚠️  No VITE_* variables found!');
  }
  
  // Load the env file
  console.log('\n🔧 Loading environment variables from .env...');
  require('dotenv').config({ path: sharedEnvPath });
  
  console.log('✅ Loaded successfully');
} else {
  if (isCI) {
    console.log('  ℹ️  Not found (expected in CI - using placeholder env vars)');
  } else {
    console.log('  ❌ NOT FOUND (This is a problem for production builds!)');
    console.log('  ⚠️  Production API key will NOT be embedded!');
  }
}

console.log('\n🔑 VITE_* Variables to be embedded in bundle:');
const viteEnvVars = Object.keys(process.env)
  .filter(key => key.startsWith('VITE_'))
  .sort();

if (viteEnvVars.length > 0) {
  viteEnvVars.forEach(key => {
    if (key === 'VITE_API_KEY') {
      const val = process.env[key];
      console.log(`  ${key}=${val?.substring(0, 20)}... (${val?.length || 0} chars)`);
    } else {
      console.log(`  ${key}=${process.env[key]}`);
    }
  });
} else {
  console.log('  ⚠️  No VITE_* variables in process.env!');
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
    
    // Check if API key is in the bundle
    const assetsPath = path.join(distPath, 'assets');
    if (fs.existsSync(assetsPath)) {
      const jsFiles = fs.readdirSync(assetsPath)
        .filter(f => f.startsWith('ApiClient') && f.endsWith('.js'));
      
      if (jsFiles.length > 0) {
        const bundlePath = path.join(assetsPath, jsFiles[0]);
        const bundle = fs.readFileSync(bundlePath, 'utf8');
        
        // Check for production API key
        const hasProdKey = bundle.includes('hs8RixMMgo8a7vvO17D6cDvkugmqGfTzpbFOqLjAznE=');
        // Check for placeholder key
        const hasPlaceholder = bundle.includes('placeholder-api-key');
        
        console.log('\n🔑 API Key Verification:');
        console.log(`  Bundle: ${jsFiles[0]}`);
        
        if (isCI) {
          console.log(`  Placeholder API Key: ${hasPlaceholder ? '✅ Present (expected in CI)' : '❌ Missing'}`);
        } else {
          console.log(`  Production API Key: ${hasProdKey ? '✅ Present' : '❌ MISSING - CHECK ENV LOADING!'}`);
          if (hasPlaceholder) {
            console.log('  ⚠️  WARNING: Placeholder key found in non-CI build!');
          }
        }
      }
    }
  }
  
  console.log('\n' + '='.repeat(70));
  
} catch (error) {
  console.error('\n❌ BUILD FAILED:', error.message);
  process.exit(1);
}
