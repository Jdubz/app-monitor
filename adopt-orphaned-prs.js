#!/usr/bin/env node
/**
 * Adopt Orphaned PRs
 * Re-creates task records for PRs that exist in GitHub but not in our database
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';

const DB_PATH = '/opt/app-monitor/shared/backend/data/dev-bots.db';
const PR_NUMBERS = [96, 97, 98, 99];

console.log('🔍 Adopting orphaned PRs:', PR_NUMBERS.join(', '));

const db = new Database(DB_PATH);

// Fetch PR data from GitHub API
async function getPRData(prNumber) {
  const response = await fetch(`https://api.github.com/repos/Jdubz/app-monitor/pulls/${prNumber}`, {
    headers: {
      'Authorization': `token ${process.env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch PR #${prNumber}: ${response.statusText}`);
  }
  
  return await response.json();
}

async function adoptPR(prNumber) {
  console.log(`\n📋 Processing PR #${prNumber}...`);
  
  const prData = await getPRData(prNumber);
  
  // Extract task ID from branch name
  const branch = prData.head.ref;
  const taskIdMatch = branch.match(/^(task-[a-z]+-[a-f0-9]+)/);
  const taskId = taskIdMatch ? taskIdMatch[1] : `task-adopted-${crypto.randomBytes(6).toString('hex')}`;
  
  console.log(`  Branch: ${branch}`);
  console.log(`  Task ID: ${taskId}`);
  console.log(`  State: ${prData.state}`);
  console.log(`  Mergeable: ${prData.mergeable}`);
  console.log(`  Title: ${prData.title}`);
  
  // Determine PR status
  let prStatus;
  if (prData.state === 'closed') {
    prStatus = prData.merged ? 'merged' : 'closed';
  } else if (prData.mergeable === false) {
    prStatus = 'pending_checks'; // Has conflicts
  } else {
    prStatus = 'pending_checks'; // Default for open PRs
  }
  
  // Determine task status
  const taskStatus = prData.state === 'closed' ? 'completed' : 'active';
  
  const createdAt = new Date(prData.created_at).getTime();
  
  // Create task record
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO tasks (
      id, type, title, description, status, created_at, 
      assigned_worker, assigned_agent, 
      pr_number, pr_url, pr_branch, pr_status, pr_created_at,
      started_at
    ) VALUES (
      ?, 'implementation', ?, ?, ?, ?,
      'cli', 'claude',
      ?, ?, ?, ?, ?,
      ?
    )
  `);
  
  stmt.run(
    taskId,
    prData.title,
    prData.body || `Adopted PR #${prNumber}`,
    taskStatus,
    new Date(createdAt).toISOString(),
    prNumber,
    prData.html_url,
    branch,
    prStatus,
    createdAt,
    createdAt
  );
  
  console.log(`  ✅ Task created: ${taskId} (status: ${taskStatus}, pr_status: ${prStatus})`);
}

async function main() {
  try {
    for (const prNumber of PR_NUMBERS) {
      await adoptPR(prNumber);
    }
    
    console.log('\n✅ All PRs adopted successfully!');
    
    // Show final state
    const tasks = db.prepare(`
      SELECT id, status, pr_number, pr_status, title 
      FROM tasks 
      WHERE pr_number IN (${PR_NUMBERS.join(',')})
      ORDER BY pr_number
    `).all();
    
    console.log('\n📊 Final state:');
    console.table(tasks);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
