#!/usr/bin/env node

/**
 * Process Safety Check Script
 * Prevents multiple nodemon instances from running simultaneously
 */

import { exec } from "child_process";
import { promisify } from "util";
import { exit } from "process";

const execAsync = promisify(exec);

async function findExistingProcesses() {
  try {
    // Find nodemon processes related to dev-monitor
    const { stdout } = await execAsync(
      'ps aux | grep -E "nodemon.*dev-monitor|tsx.*dev-monitor" | grep -v grep',
    );
    return stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
  } catch (error) {
    return [];
  }
}

async function findPortProcesses(port = 5000) {
  try {
    const { stdout } = await execAsync(`lsof -ti:${port}`);
    return stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
  } catch (error) {
    return [];
  }
}

async function main() {
  console.log("🔍 Checking for existing dev-monitor processes...");

  const existingProcesses = await findExistingProcesses();
  const portProcesses = await findPortProcesses();

  if (existingProcesses.length > 0) {
    console.error("❌ Server is already running!");
    console.error("");
    console.error("Found existing dev-monitor processes:");
    existingProcesses.forEach((process) => {
      console.error(`   ${process}`);
    });
    console.error("");
    console.error("🛑 Preventing multiple instances to avoid conflicts.");
    console.error("");
    console.error("💡 Solutions:");
    console.error(
      '   1. Kill all dev-monitor processes: pkill -f "nodemon.*dev-monitor"',
    );
    console.error("   2. Kill specific PIDs: kill <PID>");
    console.error("   3. Wait for existing processes to finish");
    exit(1);
  }

  if (portProcesses.length > 0) {
    console.error("❌ Server is already running on port 5000!");
    console.error("");
    console.error("Found processes using port 5000:");
    for (const pid of portProcesses) {
      try {
        const { stdout } = await execAsync(
          `ps -p ${pid} -o pid,cmd --no-headers`,
        );
        console.error(`   PID ${pid}: ${stdout.trim()}`);
      } catch (error) {
        console.error(`   PID ${pid}: (process info unavailable)`);
      }
    }
    console.error("");
    console.error("🛑 Port 5000 is already in use!");
    console.error("");
    console.error("💡 Solutions:");
    console.error(
      "   1. Kill processes using port 5000: lsof -ti:5000 | xargs kill",
    );
    console.error("   2. Find and kill specific PID: kill <PID>");
    console.error("   3. Wait for existing processes to finish");
    exit(1);
  }

  console.log("✅ No conflicting processes found");
  console.log("🚀 Safe to start dev server");
}

main().catch(console.error);
