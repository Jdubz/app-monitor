#!/usr/bin/env node
/**
 * Trigger PR check via webhook simulation
 */

const BACKEND_URL = 'http://localhost:5002';
const PR_NUMBERS = [97, 98];

async function triggerPRCheck(prNumber) {
  console.log(`\n🔔 Triggering PR check for #${prNumber}...`);
  
  // Fetch PR data from GitHub
  const response = await fetch(`https://api.github.com/repos/Jdubz/app-monitor/pulls/${prNumber}`, {
    headers: {
      'Authorization': `token ${process.env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  const prData = await response.json();
  
  // Simulate a complete GitHub webhook payload
  const payload = {
    action: 'synchronize',
    number: prNumber,
    pull_request: prData,
    repository: {
      name: 'app-monitor',
      full_name: 'Jdubz/app-monitor',
      owner: {
        login: 'Jdubz'
      }
    },
    sender: {
      login: 'Jdubz'
    }
  };
  
  // Send to webhook endpoint
  const webhookResponse = await fetch(`${BACKEND_URL}/api/github/webhooks/pr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': 'pull_request'
    },
    body: JSON.stringify(payload)
  });
  
  if (webhookResponse.ok) {
    const result = await webhookResponse.json();
    console.log(`  ✅ PR #${prNumber} webhook processed:`, result.message);
  } else {
    const errorText = await webhookResponse.text();
    console.log(`  ❌ Failed to process PR #${prNumber}: ${webhookResponse.statusText}`);
    console.log(`     ${errorText}`);
  }
}

async function main() {
  console.log('🔔 Triggering PR checks for:', PR_NUMBERS.join(', '));
  
  for (const prNumber of PR_NUMBERS) {
    await triggerPRCheck(prNumber);
  }
  
  console.log('\n✅ All PR checks triggered!');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
