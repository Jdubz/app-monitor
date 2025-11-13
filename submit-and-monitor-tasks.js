#!/usr/bin/env node
/**
 * Task Submission and Monitoring Script
 * 
 * Submits 5 tasks to production and monitors execution:
 * 1. Dev-bot initiation
 * 2. Execution
 * 3. PR creation
 * 4. PR tracking
 * 5. Followup task creation
 * 
 * Enforces max 2 concurrent workers with proper queue management.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';
const API_KEY = process.env.API_KEY; // Must be set in environment
const TASKS_FILE = path.join(__dirname, 'dev-bots-tasks.json');
const NUM_TASKS_TO_SUBMIT = 5;
const POLL_INTERVAL_MS = 5000; // 5 seconds
const MAX_WORKERS = 2;

// Validate API key is set
if (!API_KEY) {
  console.error('❌ ERROR: API_KEY environment variable is required');
  console.error('Set it in .env or export it:');
  console.error('  export API_KEY="your-api-key"');
  process.exit(1);
}

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  debug: (msg) => console.log(`${colors.gray}${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.bright}${colors.cyan}${msg}${colors.reset}\n`),
};

async function apiRequest(endpoint, method = 'GET', body = null) {
  const url = `${API_BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorData}`);
    }
    
    return await response.json();
  } catch (error) {
    throw new Error(`API request failed: ${error.message}`);
  }
}

async function loadTasks() {
  try {
    const data = fs.readFileSync(TASKS_FILE, 'utf8');
    const allTasks = JSON.parse(data);
    return allTasks.slice(0, NUM_TASKS_TO_SUBMIT);
  } catch (error) {
    throw new Error(`Failed to load tasks from ${TASKS_FILE}: ${error.message}`);
  }
}

async function submitTask(taskData) {
  log.info(`Submitting task: ${taskData.title}`);
  
  // Pass through most of the task data from the JSON
  const apiTask = {
    ...taskData,
    project: 'dev-bots', // Ensure project is set
    architectureReferences: taskData.architectureReferences || taskData.files || ['backend/README.md'],
  };
  
  // Remove internal fields that shouldn't be sent to API
  delete apiTask.investigation;
  delete apiTask.preImplementationChecklist;
  delete apiTask.metadata;
  delete apiTask.constraints;
  delete apiTask.gitWorkflow;
  delete apiTask.modifyOnly;
  delete apiTask.doNotModify;
  delete apiTask.doNotCreate;
  
  const result = await apiRequest('/api/dev-bots/tasks', 'POST', apiTask);
  
  const task = result.task || result.data?.task;
  if (task) {
    log.success(`Task submitted: ${task.id} - ${taskData.title}`);
    return task;
  } else {
    throw new Error('No task returned from API');
  }
}

async function getSystemStatus() {
  return await apiRequest('/api/dev-bots/status');
}

async function getTaskDetails(taskId) {
  return await apiRequest(`/api/dev-bots/tasks/${taskId}/detail`);
}

async function getQueueStatus() {
  return await apiRequest('/api/dev-bots/queue');
}

function formatDuration(startTime, endTime) {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const durationMs = end - start;
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function displayTaskStatus(task, index) {
  const statusColors = {
    pending: colors.gray,
    active: colors.blue,
    completed: colors.green,
    failed: colors.red,
  };
  
  const statusColor = statusColors[task.status] || colors.reset;
  const duration = task.createdAt ? formatDuration(task.createdAt, task.completedAt) : 'N/A';
  
  console.log(
    `  ${index + 1}. [${statusColor}${task.status.toUpperCase().padEnd(9)}${colors.reset}] ` +
    `${task.id.substring(0, 8)} - ${task.description?.substring(0, 50) || 'N/A'} ` +
    `${colors.gray}(${duration})${colors.reset}`
  );
  
  if (task.assignedWorker) {
    console.log(`     Worker: ${task.assignedWorker} | Agent: ${task.assignedAgent || 'N/A'}`);
  }
  
  if (task.error) {
    console.log(`     ${colors.red}Error: ${task.error.substring(0, 100)}${colors.reset}`);
  }
}

function displaySystemStatus(status) {
  console.log(`\n${colors.bright}System Status:${colors.reset}`);
  const data = status?.data || status || {};
  console.log(`  Workers: ${data.workerCount || 0}/${data.maxWorkers || 0} (${data.systemStatus || 'unknown'})`);
  console.log(`  Active: ${data.activeTasks || 0} | Queue: ${data.queueSize || 0}`);
}

function displayQueueSummary(queue) {
  console.log(`\n${colors.bright}Queue Summary:${colors.reset}`);
  const counts = queue?.data?.counts || queue?.counts || {};
  console.log(`  Pending: ${counts.pending || 0}`);
  console.log(`  Active: ${counts.active || 0}`);
  console.log(`  Completed: ${counts.completed || 0}`);
  console.log(`  Failed: ${counts.failed || 0}`);
}

function checkWorkerLimit(status) {
  if (status.activeTasks > MAX_WORKERS) {
    log.warning(`⚠ VIOLATION: ${status.activeTasks} tasks running (max ${MAX_WORKERS})`);
    return false;
  }
  return true;
}

async function monitorTasks(submittedTaskIds) {
  const taskMap = new Map();
  submittedTaskIds.forEach(id => taskMap.set(id, { id, status: 'pending' }));
  
  let iterationCount = 0;
  let allCompleted = false;
  
  while (!allCompleted) {
    iterationCount++;
    
    try {
      // Get current status
      const [systemStatus, queueStatus] = await Promise.all([
        getSystemStatus(),
        getQueueStatus(),
      ]);
      
      // Check worker limit compliance
      const limitOk = checkWorkerLimit(systemStatus);
      
      // Update task statuses
      for (const [taskId, taskInfo] of taskMap.entries()) {
        try {
          const details = await getTaskDetails(taskId);
          if (details.task) {
            taskMap.set(taskId, details.task);
          }
        } catch (error) {
          log.debug(`Could not fetch task ${taskId}: ${error.message}`);
        }
      }
      
      // Clear screen and display status
      console.clear();
      log.header(`📊 Task Monitoring Dashboard - Iteration ${iterationCount}`);
      
      displaySystemStatus(systemStatus);
      displayQueueSummary(queueStatus);
      
      if (!limitOk) {
        console.log(`\n${colors.red}${colors.bright}⚠ WORKER LIMIT VIOLATION DETECTED ⚠${colors.reset}`);
      }
      
      console.log(`\n${colors.bright}Submitted Tasks:${colors.reset}`);
      const tasks = Array.from(taskMap.values());
      tasks.forEach((task, index) => displayTaskStatus(task, index));
      
      // Check if all tasks are done
      const activeTasks = tasks.filter(t => t.status === 'active' || t.status === 'pending');
      allCompleted = activeTasks.length === 0;
      
      if (allCompleted) {
        log.header('✅ All tasks completed!');
        
        // Final summary
        const completed = tasks.filter(t => t.status === 'completed').length;
        const failed = tasks.filter(t => t.status === 'failed').length;
        
        console.log(`\n${colors.bright}Final Results:${colors.reset}`);
        console.log(`  ${colors.green}✓ Completed: ${completed}${colors.reset}`);
        console.log(`  ${colors.red}✗ Failed: ${failed}${colors.reset}`);
        console.log(`  Total iterations: ${iterationCount}`);
        
        break;
      }
      
      // Wait before next poll
      log.debug(`\nNext update in ${POLL_INTERVAL_MS / 1000}s... (Ctrl+C to exit)`);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      
    } catch (error) {
      log.error(`Monitoring error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
  
  return Array.from(taskMap.values());
}

async function checkFollowupTasks(originalTaskIds) {
  log.header('🔍 Checking for followup tasks...');
  
  try {
    const queue = await getQueueStatus();
    const allTasks = queue.items.map(item => item.task);
    
    const followupTasks = allTasks.filter(task => {
      const metadata = task.metadata || {};
      return metadata.originalTaskId && originalTaskIds.includes(metadata.originalTaskId);
    });
    
    if (followupTasks.length > 0) {
      log.success(`Found ${followupTasks.length} followup task(s) created`);
      followupTasks.forEach((task, index) => {
        console.log(`  ${index + 1}. ${task.id} - ${task.description?.substring(0, 60)}`);
        console.log(`     Original: ${task.metadata?.originalTaskId}`);
        console.log(`     Status: ${task.status}`);
      });
    } else {
      log.info('No followup tasks created');
    }
    
    return followupTasks;
  } catch (error) {
    log.error(`Error checking followup tasks: ${error.message}`);
    return [];
  }
}

async function checkPRStatus(taskIds) {
  log.header('🔍 Checking PR creation status...');
  
  const prsCreated = [];
  
  for (const taskId of taskIds) {
    try {
      const details = await getTaskDetails(taskId);
      if (details.task?.output) {
        // Check if output mentions PR creation
        const prMatch = details.task.output.match(/pull request.*#(\d+)/i) || 
                       details.task.output.match(/PR.*#(\d+)/i);
        
        if (prMatch) {
          prsCreated.push({ taskId, prNumber: prMatch[1] });
          log.success(`Task ${taskId.substring(0, 8)} created PR #${prMatch[1]}`);
        }
      }
    } catch (error) {
      log.debug(`Could not check PR for task ${taskId}: ${error.message}`);
    }
  }
  
  if (prsCreated.length === 0) {
    log.info('No PRs detected in task outputs');
  }
  
  return prsCreated;
}

async function main() {
  try {
    log.header('🚀 Task Submission and Monitoring System');
    
    // Load tasks
    log.info(`Loading tasks from ${TASKS_FILE}...`);
    const tasks = await loadTasks();
    log.success(`Loaded ${tasks.length} tasks`);
    
    // Check system status
    log.info('Checking system status...');
    const initialStatus = await getSystemStatus();
    log.success(`System is ${initialStatus.systemStatus}`);
    log.info(`Current workers: ${initialStatus.workerCount}/${initialStatus.maxWorkers}`);
    
    if (initialStatus.maxWorkers !== MAX_WORKERS) {
      log.warning(`Expected max workers: ${MAX_WORKERS}, got: ${initialStatus.maxWorkers}`);
    }
    
    // Submit tasks
    log.header('📤 Submitting tasks...');
    const submittedTasks = [];
    
    for (const task of tasks) {
      try {
        const submitted = await submitTask(task);
        submittedTasks.push(submitted);
        await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between submissions
      } catch (error) {
        log.error(`Failed to submit task "${task.title}": ${error.message}`);
      }
    }
    
    log.success(`Successfully submitted ${submittedTasks.length}/${tasks.length} tasks`);
    
    if (submittedTasks.length === 0) {
      log.error('No tasks were submitted. Exiting.');
      process.exit(1);
    }
    
    const submittedTaskIds = submittedTasks.map(t => t.id);
    
    // Wait a moment for tasks to enter queue
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Monitor task execution
    log.header('👀 Starting monitoring...');
    const finalTasks = await monitorTasks(submittedTaskIds);
    
    // Check for PRs
    await checkPRStatus(submittedTaskIds);
    
    // Check for followup tasks
    await checkFollowupTasks(submittedTaskIds);
    
    log.header('📊 Execution Complete');
    
    const successCount = finalTasks.filter(t => t.status === 'completed').length;
    const failureCount = finalTasks.filter(t => t.status === 'failed').length;
    
    if (successCount === finalTasks.length) {
      log.success('All tasks completed successfully! ✨');
      process.exit(0);
    } else if (failureCount > 0) {
      log.warning(`Completed with ${failureCount} failure(s)`);
      process.exit(1);
    }
    
  } catch (error) {
    log.error(`Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log.warning('\nReceived SIGINT. Exiting...');
  process.exit(0);
});

main();
