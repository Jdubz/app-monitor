#!/usr/bin/env node

const { chromium } = require('playwright');
const fs = require('fs');

async function captureProdLogs() {
  console.log('🔍 Capturing production frontend API calls...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = {
    console: [],
    network: [],
    apiCalls: []
  };

  // Capture console
  page.on('console', msg => {
    const entry = {
      type: msg.type(),
      text: msg.text(),
      timestamp: new Date().toISOString()
    };
    logs.console.push(entry);
    console.log(`[Console ${msg.type()}]`, msg.text());
  });

  // Capture network
  page.on('request', request => {
    const headers = request.headers();
    const entry = {
      url: request.url(),
      method: request.method(),
      headers,
      timestamp: new Date().toISOString()
    };
    
    if (request.url().includes('/api/')) {
      const apiKey = headers['x-api-key'] || headers['X-API-Key'];
      entry.hasApiKey = !!apiKey;
      entry.apiKey = apiKey ? apiKey.substring(0, 20) + '...' : 'NOT SET';
      logs.apiCalls.push(entry);
      
      console.log(`\n🔵 API REQUEST: ${request.method()} ${request.url()}`);
      console.log(`   X-API-Key: ${apiKey ? '✅ ' + entry.apiKey : '❌ NOT SET'}`);
    }
    
    logs.network.push(entry);
  });

  page.on('response', response => {
    const entry = {
      url: response.url(),
      status: response.status(),
      statusText: response.statusText(),
      timestamp: new Date().toISOString()
    };
    
    logs.network.push(entry);
    
    if (response.url().includes('/api/')) {
      console.log(`🟢 API RESPONSE: ${response.status()} ${response.url()}`);
      if (response.status() === 401) {
        console.log(`   ⚠️  401 UNAUTHORIZED!`);
      }
    }
  });

  // Navigate
  console.log('📱 Navigating to https://app-monitor.joshwentworth.com\n');
  await page.goto('https://app-monitor.joshwentworth.com');
  
  // Wait for API calls
  console.log('⏳ Waiting 10 seconds for page to load and make API calls...\n');
  await page.waitForTimeout(10000);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Console logs: ${logs.console.length}`);
  console.log(`Network requests: ${logs.network.length}`);
  console.log(`API calls: ${logs.apiCalls.length}`);
  
  const unauthorized = logs.network.filter(l => l.status === 401);
  console.log(`401 errors: ${unauthorized.length}`);
  
  console.log('\n🔑 API KEY STATUS PER REQUEST:');
  logs.apiCalls.forEach(req => {
    console.log(`  ${req.method} ${req.url.split('/api/')[1]}`);
    console.log(`    ${req.hasApiKey ? '✅' : '❌'} API Key: ${req.apiKey}`);
  });

  // Save
  fs.writeFileSync('/tmp/production-api-logs.json', JSON.stringify(logs, null, 2));
  console.log('\n💾 Full logs saved to /tmp/production-api-logs.json');

  console.log('\n⏸️  Keeping browser open for 30 seconds for manual inspection...');
  await page.waitForTimeout(30000);
  
  await browser.close();
}

captureProdLogs().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
