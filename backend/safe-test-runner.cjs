#!/usr/bin/env node

/**
 * Safe Test Runner - app-monitor-backend
 *
 * Prevents test explosions through process locking and resource control.
 * This is the ONLY way to run tests in this repository.
 */

const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { getMaxThreads } = require('./vitest.shared.config.js')

// Configuration
const LOCK_FILE = path.join(__dirname, '.test-lock')
const MAX_MEMORY_MB = 2048 // 2GB max memory
const MAX_EXECUTION_TIME = 10 * 60 * 1000 // 10 minutes

class SafeTestRunner {
  constructor() {
    this.startTime = Date.now()
    this.lockAcquired = false
  }

  acquireLock() {
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'))
      const lockAge = Date.now() - new Date(lockData.startTime).getTime()
      
      if (lockAge > 15 * 60 * 1000) {
        console.log('⚠️  Removing stale lock file')
        fs.unlinkSync(LOCK_FILE)
      } else {
        console.error('❌ Another test process is already running')
        console.error('   PID: ' + lockData.pid)
        console.error('   Started: ' + lockData.startTime)
        process.exit(1)
      }
    }

    const lockData = {
      pid: process.pid,
      startTime: new Date().toISOString(),
      repository: 'app-monitor-backend',
      testSuite: 'unit'
    }
    
    fs.writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2))
    this.lockAcquired = true
    console.log('🔒 Test execution lock acquired')
  }

  releaseLock() {
    if (this.lockAcquired && fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE)
      console.log('🔓 Test execution lock released')
    }
  }

  startResourceMonitoring() {
    const monitorInterval = setInterval(() => {
      const memUsage = process.memoryUsage()
      const memUsageMB = memUsage.heapUsed / 1024 / 1024
      const executionTime = Date.now() - this.startTime

      if (memUsageMB > MAX_MEMORY_MB) {
        console.error('\n⚠️  CRITICAL: Memory usage exceeded ' + MAX_MEMORY_MB + 'MB')
        console.error('Current usage: ' + memUsageMB.toFixed(1) + 'MB')
        this.terminateTests()
        process.exit(1)
      }

      if (executionTime > MAX_EXECUTION_TIME) {
        console.error('\n⚠️  CRITICAL: Test execution exceeded ' + (MAX_EXECUTION_TIME / 1000) + 's')
        this.terminateTests()
        process.exit(1)
      }

      if (executionTime % 30000 < 1000) {
        console.log('[Monitor] Memory: ' + memUsageMB.toFixed(1) + 'MB | Time: ' + (executionTime / 1000).toFixed(1) + 's')
      }
    }, 1000)

    this.monitorInterval = monitorInterval
  }

  stopResourceMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval)
      this.monitorInterval = null
    }
  }

  terminateTests() {
    console.log('\n🛑 Terminating test processes...')
    try {
      if (process.platform === 'win32') {
        require('child_process').execSync('taskkill /F /IM vitest* /T', { stdio: 'inherit' })
      } else {
        require('child_process').execSync('pkill -9 -f vitest', { stdio: 'inherit' })
      }
    } catch (error) {
      console.log('No test processes to terminate')
    }
  }

  async runTests() {
    return new Promise((resolve) => {
      console.log('\n🧪 Running tests...')

      // Get thread count from shared config
      const maxThreads = getMaxThreads()

      const vitestArgs = [
        'vitest',
        'run',
        '--no-coverage',
        '--reporter=verbose'
      ]

      const testProcess = spawn('npx', vitestArgs, {
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: {
          ...process.env,
          NODE_OPTIONS: '--max-old-space-size=2048',
          VITEST_POOL: 'threads',
          VITEST_MAX_THREADS: maxThreads,
          VITEST_MIN_THREADS: '1',
          SKIP_HEAVY_DEV_BOT_TESTS: process.env.SKIP_HEAVY_DEV_BOT_TESTS || '1'
        }
      })

      testProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Tests completed successfully')
          resolve(true)
        } else {
          console.log('❌ Tests failed (exit code: ' + code + ')')
          resolve(false)
        }
      })

      testProcess.on('error', (error) => {
        console.error('Error running tests:', error)
        resolve(false)
      })
    })
  }

  async run() {
    console.log('\n🛡️  Safe Test Runner - app-monitor-backend\n')
    
    try {
      this.acquireLock()
      this.startResourceMonitoring()
      const success = await this.runTests()
      this.stopResourceMonitoring()
      this.releaseLock()
      process.exit(success ? 0 : 1)
    } catch (error) {
      console.error('Fatal error:', error)
      this.stopResourceMonitoring()
      this.releaseLock()
      process.exit(1)
    }
  }
}

process.on('SIGINT', () => {
  console.log('\n\nReceived SIGINT, cleaning up...')
  const runner = new SafeTestRunner()
  runner.terminateTests()
  runner.releaseLock()
  process.exit(130)
})

process.on('SIGTERM', () => {
  console.log('\n\nReceived SIGTERM, cleaning up...')
  const runner = new SafeTestRunner()
  runner.terminateTests()
  runner.releaseLock()
  process.exit(143)
})

const runner = new SafeTestRunner()
runner.run().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
