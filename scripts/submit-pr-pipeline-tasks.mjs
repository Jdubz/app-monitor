#!/usr/bin/env node
/**
 * Submit PR Pipeline Enhancement Tasks to Production API
 * 
 * Submits V3 template tasks for PR workflow enhancements.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE_URL = process.env.API_URL || 'https://app-monitor.joshwentworth.com/api';
const TASKS_FILE = path.join(__dirname, '..', 'pr-pipeline-enhancement-tasks.json');

async function submitTask(task) {
  const url = `${API_BASE_URL}/dev-bots/tasks`;
  
  console.log(`\n📤 Submitting task: ${task.title}`);
  console.log(`   Type: ${task.type}`);
  console.log(`   Priority: ${task.priority}`);
  console.log(`   Agent: ${task.assignedAgent}`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(task)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`   ✅ Created task ID: ${result.data.id}`);
      return { success: true, taskId: result.data.id, task };
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      return { success: false, error: result.error, task };
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message, task };
  }
}

async function main() {
  console.log('🚀 PR Pipeline Enhancement Task Submission');
  console.log(`📡 Target API: ${API_BASE_URL}`);
  console.log(`📋 Tasks file: ${TASKS_FILE}`);
  
  // Check if API is reachable
  try {
    console.log('\n🔍 Checking API health...');
    const healthCheck = await fetch(`${API_BASE_URL}/health`);
    if (!healthCheck.ok) {
      console.error('❌ API health check failed');
      process.exit(1);
    }
    const health = await healthCheck.json();
    console.log(`✅ API is healthy (uptime: ${Math.floor(health.data.uptime)}s)`);
  } catch (error) {
    console.error(`❌ Cannot reach API: ${error.message}`);
    console.error('\nℹ️  Make sure the production server is running:');
    console.error('   - Check systemctl status app-monitor-backend@5001');
    console.error('   - Verify Cloudflare tunnel is running');
    console.error('   - Or set API_URL env var for local testing');
    process.exit(1);
  }
  
  // Load tasks
  let tasks;
  try {
    const tasksData = fs.readFileSync(TASKS_FILE, 'utf-8');
    tasks = JSON.parse(tasksData);
    console.log(`\n📦 Loaded ${tasks.length} tasks from file`);
  } catch (error) {
    console.error(`❌ Failed to load tasks file: ${error.message}`);
    process.exit(1);
  }
  
  // Submit tasks
  const results = [];
  for (const task of tasks) {
    const result = await submitTask(task);
    results.push(result);
    
    // Wait a bit between submissions
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 SUBMISSION SUMMARY');
  console.log('='.repeat(70));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\n✅ Successful: ${successful.length}/${results.length}`);
  if (successful.length > 0) {
    successful.forEach(r => {
      console.log(`   - ${r.taskId}: ${r.task.title}`);
    });
  }
  
  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}/${results.length}`);
    failed.forEach(r => {
      console.log(`   - ${r.task.title}`);
      console.log(`     Error: ${r.error}`);
    });
  }
  
  console.log('\n' + '='.repeat(70));
  
  if (successful.length > 0) {
    console.log('\n🎯 Next Steps:');
    console.log('   1. Check task dashboard: https://app-monitor.joshwentworth.com');
    console.log('   2. Monitor task execution in logs');
    console.log('   3. Review PRs created by dev-bots');
    console.log('   4. Validate webhook events are processed');
  }
  
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
