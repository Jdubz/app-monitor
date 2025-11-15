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
const newContent = content.replace(
  /const BUILD_TIMESTAMP = ['"].*?['"];/,
  `const BUILD_TIMESTAMP = '${timestamp}';`
);

if (newContent !== content) {
  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log(`✓ Updated BUILD_TIMESTAMP to ${timestamp} in ${path.relative(process.cwd(), filePath)}`);
} else {
  console.log(`⚠ BUILD_TIMESTAMP not found in ${path.relative(process.cwd(), filePath)}`);
  process.exit(1);
}
