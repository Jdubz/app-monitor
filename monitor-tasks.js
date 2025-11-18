#!/usr/bin/env node
/**
 * Monitor Existing Tasks
 * 
 * Monitors currently running tasks without submitting new ones.
 * Use this to track tasks that are already in the queue.
 */

import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';
const API_KEY = process.env.API_KEY;
const POLL_INTERVAL_MS = 5000;
const MAX_WORKERS = 2;

if (!API_KEY) {
  console.error('❌ ERROR: API_KEY environment variable is required');
  console.error('Source it from: source /opt/app-monitor/shared/.env');
  process.exit(1);
}

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

async function apiRequest(endpoint) {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: { 'X-API-Key': API_KEY }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  return await response.json();
}

function formatDuration(startTime, endTime) {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const durationMs = end - start;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

async function monitor() {
  let iteration = 0;
  
  while (true) {
    iteration++;
    
    try {
      const [statusResponse, queueResponse] = await Promise.all([
        apiRequest('/api/dev-bots/status'),
        apiRequest('/api/dev-bots/queue'),
      ]);
      
      const status = statusResponse.data || statusResponse;
      const queue = queueResponse.data || queueResponse;
      
      console.clear();
      console.log(`\n${colors.bright}${colors.cyan}📊 Task Monitor - Iteration ${iteration}${colors.reset}\n`);
      
      console.log(`${colors.bright}System:${colors.reset}`);
      console.log(`  Status: ${status.systemStatus}`);
      console.log(`  Workers: ${status.workerCount}/${status.maxWorkers}`);
      console.log(`  Active Tasks: ${status.activeTasks}`);
      
      if (status.activeTasks > MAX_WORKERS) {
        console.log(`  ${colors.red}${colors.bright}⚠ WORKER LIMIT VIOLATION${colors.reset}`);
      }
      
      console.log(`\n${colors.bright}Queue:${colors.reset}`);
      console.log(`  Pending: ${queue.counts.pending}`);
      console.log(`  Active: ${queue.counts.active}`);
      console.log(`  Completed: ${queue.counts.completed}`);
      console.log(`  Failed: ${queue.counts.failed}`);
      
      const activeTasks = queue.items.filter(i => i.bucket === 'active');
      const pendingTasks = queue.items.filter(i => i.bucket === 'pending');
      
      if (activeTasks.length > 0) {
        console.log(`\n${colors.bright}${colors.blue}Active Tasks:${colors.reset}`);
        activeTasks.forEach((item, idx) => {
          const t = item.task;
          const duration = formatDuration(t.assignedAt || t.createdAt);
          const phaseInfo = t.phaseIndex && t.phaseName 
            ? `Phase ${t.phaseIndex}/7: ${t.phaseName}${t.phaseAttempts > 1 ? ` (attempt ${t.phaseAttempts})` : ''}`
            : 'N/A';
          console.log(`  ${idx + 1}. ${t.id.substring(0, 8)} - ${colors.blue}RUNNING${colors.reset} (${duration})`);
          console.log(`     ${t.description?.substring(0, 70) || 'No description'}`);
          console.log(`     Worker: ${t.assignedWorker || 'N/A'} | Agent: ${t.assignedAgent || 'N/A'}`);
          console.log(`     ${colors.cyan}${phaseInfo}${colors.reset}`);
        });
      }
      
      if (pendingTasks.length > 0) {
        console.log(`\n${colors.bright}${colors.gray}Pending Tasks:${colors.reset}`);
        pendingTasks.slice(0, 5).forEach((item, idx) => {
          const t = item.task;
          const waitTime = formatDuration(t.createdAt);
          const phaseInfo = t.phaseIndex && t.phaseName 
            ? `Phase ${t.phaseIndex}/7: ${t.phaseName}`
            : 'N/A';
          console.log(`  ${idx + 1}. ${t.id.substring(0, 8)} - ${colors.gray}WAITING${colors.reset} (${waitTime})`);
          console.log(`     ${t.description?.substring(0, 70) || 'No description'}`);
          console.log(`     ${colors.gray}${phaseInfo}${colors.reset}`);
        });
        if (pendingTasks.length > 5) {
          console.log(`     ... and ${pendingTasks.length - 5} more`);
        }
      }
      
      const allDone = queue.counts.active === 0 && queue.counts.pending === 0;
      if (allDone) {
        console.log(`\n${colors.green}${colors.bright}✅ All tasks completed!${colors.reset}`);
        console.log(`\nFinal: ${queue.counts.completed} completed, ${queue.counts.failed} failed`);
        break;
      }
      
      console.log(`\n${colors.gray}Next update in ${POLL_INTERVAL_MS / 1000}s... (Ctrl+C to exit)${colors.reset}`);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      
    } catch (error) {
      console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Exiting...${colors.reset}`);
  process.exit(0);
});

monitor();
