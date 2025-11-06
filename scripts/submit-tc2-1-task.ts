#!/usr/bin/env tsx
/**
 * Submit TC-2.1 task to dev-bots queue
 *
 * This script creates the first atomic task for implementing context persistence.
 * TC-2.1: Add saveTaskCreationContext method to database service
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function submitTask() {
  const taskPath = path.join(
    __dirname,
    '..',
    'backend',
    'config',
    'tasks',
    'tc2-1-save-creation-context.json'
  );

  const taskData = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));

  console.log('📋 Submitting atomic task to dev-bots queue...');
  console.log(`   Title: ${taskData.title}`);
  console.log(`   Type: ${taskData.type}`);
  console.log(`   Agent: ${taskData.assignedAgent}`);
  console.log(`   Estimated: ${taskData.estimatedEffort.hours}h (${taskData.estimatedEffort.complexity})`);
  console.log(`   Files: ${taskData.files.length}`);

  try {
    const response = await fetch('http://localhost:5000/api/dev-bots/tasks/enhanced', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(taskData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`API error: ${error.message || response.statusText}`);
    }

    const result = await response.json();
    console.log('\n✅ Task created successfully!');
    console.log(`   Task ID: ${result.task?.id || result.id}`);
    console.log(`   Status: ${result.task?.status || result.status}`);
    console.log(`   Priority: ${result.task?.priority || result.priority}`);

    const taskId = result.task?.id || result.id;

    console.log('\n📊 Next steps:');
    console.log('   1. Start dev-bots system via UI: http://localhost:5173');
    console.log('   2. Navigate to Dev Bots panel');
    console.log('   3. Click "Start System" to begin processing');
    console.log(`   4. Monitor task ${taskId} execution`);
    console.log('   5. Review results to validate atomic task sizing');

    return result.task || result;
  } catch (error) {
    console.error('\n❌ Failed to submit task:');
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    console.error('\n💡 Make sure:');
    console.error('   - Backend is running (npm run dev -w backend)');
    console.error('   - Backend is listening on http://localhost:5000');
    console.error('   - Migration 002 (tasks table) has been applied');
    console.error('   - Migration 004 (task context) has been applied');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  submitTask().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { submitTask };
