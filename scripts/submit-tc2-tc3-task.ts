#!/usr/bin/env tsx
/**
 * Submit TC-2 & TC-3 task to dev-bots queue
 *
 * This script creates a task for implementing the context persistence service
 * and API endpoints, demonstrating the dev-bots task execution pipeline.
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
    'tc2-tc3-context-api.json'
  );

  const taskData = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));

  console.log('📋 Submitting task to dev-bots queue...');
  console.log(`   Title: ${taskData.title}`);
  console.log(`   Type: ${taskData.type}`);
  console.log(`   Agent: ${taskData.assignedAgent}`);
  console.log(`   Estimated: ${taskData.estimatedEffort.hours}h (${taskData.estimatedEffort.complexity})`);

  try {
    const response = await fetch('http://localhost:5050/api/dev-bots/tasks/enhanced', {
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
    console.log(`   Task ID: ${result.task.id}`);
    console.log(`   Status: ${result.task.status}`);
    console.log(`   Assigned: ${result.task.assignedAgent}`);

    console.log('\n📊 Next steps:');
    console.log('   1. Start dev-bots system via UI: http://localhost:5173');
    console.log('   2. Navigate to Dev Bots panel');
    console.log('   3. Click "Start System" to begin processing');
    console.log(`   4. Monitor task ${result.task.id} execution`);
    console.log('   5. Review artifacts in logs/dev-bots/<task-id>/<run-id>/');

    return result.task;
  } catch (error) {
    console.error('\n❌ Failed to submit task:');
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    console.error('\n💡 Make sure:');
    console.error('   - Backend is running (npm run dev -w backend)');
    console.error('   - Backend is listening on http://localhost:5050');
    console.error('   - Database migration 004 has been applied');
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
