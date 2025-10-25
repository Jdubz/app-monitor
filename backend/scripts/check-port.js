#!/usr/bin/env node

/**
 * Port Safety Check Script
 * Prevents multiple instances from binding to the same port
 */

import { createServer } from 'net';
import { exit } from 'process';

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';

function checkPortAvailable(port, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const server = createServer();
    
    server.listen(port, host, () => {
      server.close(() => {
        resolve(true); // Port is available
      });
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false); // Port is in use
      } else {
        resolve(false); // Other error
      }
    });
  });
}

async function main() {
  console.log(`🔍 Checking if port ${PORT} is available...`);
  
  const isAvailable = await checkPortAvailable(PORT, HOST);
  
  if (!isAvailable) {
    console.error(`❌ Server is already running on port ${PORT}!`);
    console.error('');
    console.error('🛑 Preventing multiple instances to avoid conflicts.');
    console.error('');
    console.error('💡 Solutions:');
    console.error('   1. Kill existing process: pkill -f "nodemon.*dev-monitor"');
    console.error('   2. Find and kill specific PID: lsof -ti:5000 | xargs kill');
    console.error('   3. Wait for existing process to finish');
    console.error('');
    console.error('🔍 Current processes on port 5000:');
    
    // Show what's using the port
    const { exec } = await import('child_process');
    exec(`lsof -i :${PORT}`, (error, stdout) => {
      if (stdout) {
        console.error(stdout);
      }
    });
    
    exit(1);
  }
  
  console.log(`✅ Port ${PORT} is available`);
  console.log('🚀 Safe to start dev server');
}

main().catch(console.error);
