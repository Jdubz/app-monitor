import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../../..');  // backend/scripts -> backend -> app-monitor -> root

console.log('🔍 Verifying App Monitor Configuration...\n');

// Check paths
const paths = [
  { name: 'Root dir', path: ROOT_DIR },
  { name: 'App Monitor Backend', path: path.join(ROOT_DIR, 'app-monitor/backend') },
  { name: 'App Monitor Frontend', path: path.join(ROOT_DIR, 'app-monitor/frontend') },
  { name: 'Backend logs dir', path: path.join(ROOT_DIR, 'app-monitor/backend/logs') },
  { name: 'Frontend logs dir', path: path.join(ROOT_DIR, 'app-monitor/frontend/logs') },
  { name: 'Dev-bots logs dir', path: path.join(ROOT_DIR, 'app-monitor/dev-bots/logs') },
  { name: 'Job Finder BE', path: path.join(ROOT_DIR, 'job-finder-BE') },
  { name: 'Job Finder FE', path: path.join(ROOT_DIR, 'job-finder-FE') },
  { name: 'Job Finder Worker', path: path.join(ROOT_DIR, 'job-finder-worker') },
  { name: 'BE logs dir', path: path.join(ROOT_DIR, 'job-finder-BE/logs') },
  { name: 'FE logs dir', path: path.join(ROOT_DIR, 'job-finder-FE/logs') },
  { name: 'Worker logs dir', path: path.join(ROOT_DIR, 'job-finder-worker/logs') },
  { name: 'Log sources config', path: path.join(__dirname, '../config/log-sources.json') },
  { name: 'Backend .env', path: path.join(__dirname, '../.env') },
  { name: 'Frontend .env', path: path.join(ROOT_DIR, 'app-monitor/frontend/.env') },
];

let allGood = true;
console.log('📁 Path Checks:');
paths.forEach(({ name, path: p }) => {
  const exists = fs.existsSync(p);
  console.log(`  ${exists ? '✅' : '❌'} ${name}: ${p}`);
  if (!exists) allGood = false;
});

// Check ports
console.log('\n🔌 Port Configuration:');
const ports = {
  'App Monitor Backend': 5000,
  'App Monitor Frontend': 5174,
  'Job Finder Backend': 5001,
  'Job Finder Frontend': 5173,
  'Firebase Emulator UI': 4000,
  'Firebase Emulator Hub': 4400,
  'Firebase Functions': 8080,
  'Firebase Auth': 9099,
  'Firebase Storage': 9199,
  'Job Finder Worker': 5555,
};

Object.entries(ports).forEach(([name, port]) => {
  console.log(`  📌 ${name}: ${port}`);
});

// Load and validate log sources config
console.log('\n📋 Log Sources Configuration:');
try {
  const configPath = path.join(__dirname, '../config/log-sources.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const enabled = Object.entries(config.logSources)
    .filter(([_, src]) => src.enabled)
    .map(([key, src]) => ({ key, ...src }));
  
  console.log(`  Version: ${config.version}`);
  console.log(`  Total sources: ${Object.keys(config.logSources).length}`);
  console.log(`  Enabled sources: ${enabled.length}`);
  console.log('');
  
  enabled.forEach((src) => {
    const logPath = path.resolve(path.join(__dirname, '..'), src.path);
    const dirExists = fs.existsSync(path.dirname(logPath));
    console.log(`  ${dirExists ? '✅' : '⚠️'} ${src.name}`);
    console.log(`     Path: ${src.path}`);
    console.log(`     Format: ${src.format} | Parser: ${src.parser}`);
  });
} catch (err) {
  console.log(`  ❌ Failed to load config: ${err.message}`);
  allGood = false;
}

// Environment variables
console.log('\n🌍 Environment Configuration:');
try {
  const envPath = path.join(__dirname, '../.env');
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const envVars = envContent.split('\n').filter(line => line && !line.startsWith('#'));
  envVars.forEach(line => {
    const [key] = line.split('=');
    console.log(`  ✅ ${key}`);
  });
} catch (err) {
  console.log(`  ❌ Failed to load .env: ${err.message}`);
  allGood = false;
}

console.log('\n' + '═'.repeat(70));
if (allGood) {
  console.log('✅ All checks passed! Configuration is ready.');
  console.log('\nNext steps:');
  console.log('  1. cd app-monitor');
  console.log('  2. make dev-backend  (start backend)');
  console.log('  3. make dev-frontend (start frontend in new terminal)');
  console.log('  4. Open http://localhost:5174');
} else {
  console.log('❌ Some checks failed. Review errors above.');
  process.exit(1);
}
console.log('═'.repeat(70));

process.exit(0);
