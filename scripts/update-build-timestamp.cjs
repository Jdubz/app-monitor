#!/usr/bin/env node
/**
 * Updates BUILD_TIMESTAMP placeholder in ApiClient.ts before build
 * This ensures each build generates a unique bundle hash for cache busting
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../frontend/src/services/ApiClient.ts');
let content = fs.readFileSync(filePath, 'utf8');

const timestamp = new Date().toISOString();

// Validate that the constant declaration exists (not just the string)
if (!/const\s+BUILD_TIMESTAMP\s*=/.test(content)) {
  console.error(`❌ BUILD_TIMESTAMP constant declaration not found in ${path.relative(process.cwd(), filePath)}`);
  console.error('   Expected format: const BUILD_TIMESTAMP = "...";');
  process.exit(1);
}

// More robust regex with capturing group to preserve formatting
const newContent = content.replace(
  /(const BUILD_TIMESTAMP\s*=\s*)['"].*?['"];/,
  `$1'${timestamp}';`
);

if (newContent !== content) {
  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log(`✓ Updated BUILD_TIMESTAMP to ${timestamp} in ${path.relative(process.cwd(), filePath)}`);
} else {
  console.error(`❌ Failed to replace BUILD_TIMESTAMP in ${path.relative(process.cwd(), filePath)}`);
  console.error('   Check that the constant follows the expected format: const BUILD_TIMESTAMP = "...";');
  process.exit(1);
}
