#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('='.repeat(70));
console.log('🏗️  FRONTEND BUILD WITH ENVIRONMENT LOGGING');
console.log('='.repeat(70));

const rootDir = path.join(__dirname, '..');
const sharedEnvPath = path.join(rootDir, 'shared', '.env');

console.log('\n📍 Build Location:');
console.log('  Working Directory:', process.cwd());
console.log('  Frontend Directory:', __dirname);
console.log('  Root Directory:', rootDir);
console.log('  Shared .env Path:', sharedEnvPath);

console.log('\n🔍 Environment File Check:');
if (fs.existsSync(sharedEnvPath)) {
  console.log('  ✅ Found:', sharedEnvPath);
  const envContent = fs.readFileSync(sharedEnvPath, 'utf8');
  const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  
  console.log('\n📝 Environment Variables (will be embedded in build):');
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
    console.log('  ⚠️  No VITE_* variables found in .env file!');
  }
  
  // Load the env file
  console.log('\n🔧 Loading environment variables...');
  require('dotenv').config({ path: sharedEnvPath });
  
  console.log('\n✅ Environment loaded. VITE_* vars that will be embedded:');
  Object.keys(process.env)
    .filter(key => key.startsWith('VITE_'))
    .forEach(key => {
      if (key === 'VITE_API_KEY') {
        console.log(`  ${key}=${process.env[key]?.substring(0, 20)}...`);
      } else {
        console.log(`  ${key}=${process.env[key]}`);
      }
    });
} else {
  console.log('  ❌ NOT FOUND:', sharedEnvPath);
  console.log('  ⚠️  Build will proceed WITHOUT production environment variables!');
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
    const files = fs.readdirSync(distPath);
    console.log('  Files:', files.join(', '));
    
    // Check if API key is in the bundle
    const jsFiles = fs.readdirSync(path.join(distPath, 'assets'))
      .filter(f => f.startsWith('ApiClient') && f.endsWith('.js'));
    
    if (jsFiles.length > 0) {
      const bundlePath = path.join(distPath, 'assets', jsFiles[0]);
      const bundle = fs.readFileSync(bundlePath, 'utf8');
      const hasApiKey = bundle.includes('hs8RixMMgo8a7vvO17D6cDvkugmqGfTzpbFOqLjAznE=');
      
      console.log('\n🔑 API Key Verification:');
      console.log(`  Bundle: ${jsFiles[0]}`);
      console.log(`  Contains Production API Key: ${hasApiKey ? '✅ YES' : '❌ NO'}`);
      
      if (!hasApiKey) {
        console.log('\n⚠️  WARNING: Production API key NOT found in bundle!');
        console.log('   The build may not have loaded the .env file correctly.');
      }
    }
  }
  
  console.log('\n' + '='.repeat(70));
  
} catch (error) {
  console.error('\n❌ BUILD FAILED:', error.message);
  process.exit(1);
}
