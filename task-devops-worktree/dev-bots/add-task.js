#!/usr/bin/env node

const http = require('http');

const API_BASE = 'http://localhost:5001';

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5001,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve(parsed);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function addTask(type, description, priority = 'medium') {
  try {
    const response = await makeRequest('POST', '/api/tasks', {
      type,
      description,
      priority
    });
    
    console.log('✅ Task added successfully:');
    console.log(`   ID: ${response.task.id}`);
    console.log(`   Type: ${response.task.type}`);
    console.log(`   Description: ${response.task.description}`);
    console.log(`   Priority: ${response.task.priority}`);
    console.log(`   Status: ${response.task.status}`);
    
    return response.task;
  } catch (error) {
    console.error('❌ Error adding task:', error.message);
    process.exit(1);
  }
}

async function getStatus() {
  try {
    const status = await makeRequest('GET', '/api/status');
    
    console.log('📊 System Status:');
    console.log(`   Status: ${status.status}`);
    console.log(`   Queue Size: ${status.queueSize}`);
    console.log(`   Active Tasks: ${status.activeTasks}`);
    console.log(`   Uptime: ${Math.round(status.uptime)}s`);
    console.log('');
    console.log('👷 Workers:');
    Object.entries(status.workers).forEach(([workerId, worker]) => {
      const currentTask = worker.currentTask ? ` (Task: ${worker.currentTask})` : '';
      console.log(`   ${workerId}: ${worker.status}${currentTask}`);
    });
    
  } catch (error) {
    console.error('❌ Error getting status:', error.message);
    process.exit(1);
  }
}

async function getTasks() {
  try {
    const tasks = await makeRequest('GET', '/api/tasks');
    
    console.log('📋 Task Queue:');
    console.log(`   Pending: ${tasks.pending.length}`);
    console.log(`   Active: ${tasks.active.length}`);
    console.log(`   Completed: ${tasks.completed.length}`);
    console.log('');
    
    if (tasks.completed.length > 0) {
      console.log('✅ Recent Completed Tasks:');
      tasks.completed.slice(-5).forEach(task => {
        console.log(`   ${task.id}: ${task.type} - ${task.status}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error getting tasks:', error.message);
    process.exit(1);
  }
}

function showHelp() {
  console.log('Claude Workers Task Manager');
  console.log('==========================');
  console.log('');
  console.log('Commands:');
  console.log('  add <type> "<description>" [priority]  - Add a new task');
  console.log('  status                                  - Show system status');
  console.log('  tasks                                   - Show task queue');
  console.log('');
  console.log('Examples:');
  console.log('  node add-task.js add implementation "Fix the login bug" high');
  console.log('  node add-task.js add review "Review PR #123" medium');
  console.log('  node add-task.js status');
  console.log('  node add-task.js tasks');
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    showHelp();
    return;
  }
  
  const command = args[0];
  
  switch (command) {
    case 'add':
      if (args.length < 3) {
        console.error('❌ Usage: add <type> "<description>" [priority]');
        process.exit(1);
      }
      const type = args[1];
      const description = args[2];
      const priority = args[3] || 'medium';
      await addTask(type, description, priority);
      break;
      
    case 'status':
      await getStatus();
      break;
      
    case 'tasks':
      await getTasks();
      break;
      
    default:
      console.error(`❌ Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch(console.error);