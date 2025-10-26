import { describe, it, expect, beforeEach } from 'vitest'
import { logger } from './logger'
import * as fs from 'fs'
import * as path from 'path'

describe('Logger', () => {
  const testLogFile = path.join(__dirname, '../../../logs/dev-monitor-backend.log')

  beforeEach(() => {
    // Clear any existing log file
    if (fs.existsSync(testLogFile)) {
      fs.writeFileSync(testLogFile, '')
    }
  })

  describe('Structured Logger', () => {
    it('should log info messages', () => {
      const consoleSpy = vi.spyOn(console, 'log')

      logger.info({
        category: 'system',
        action: 'test',
        message: 'Test info message'
      })

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should log error messages with error objects', () => {
      const consoleSpy = vi.spyOn(console, 'error')
      const testError = new Error('Test error')

      logger.error({
        category: 'system',
        action: 'test',
        message: 'Test error message',
        error: testError
      })

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should log warning messages', () => {
      const consoleSpy = vi.spyOn(console, 'warn')

      logger.warn({
        category: 'system',
        action: 'test',
        message: 'Test warning message'
      })

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should default category to system when not provided', () => {
      const consoleSpy = vi.spyOn(console, 'log')

      logger.info({
        action: 'test',
        message: 'Test message without category'
      } as any)

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should include optional details in log entry', () => {
      const consoleSpy = vi.spyOn(console, 'log')

      logger.info({
        category: 'api',
        action: 'request',
        message: 'API request received',
        details: { endpoint: '/test', method: 'GET' }
      })

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('Log File Writing', () => {
    it('should create log directory if it does not exist', () => {
      const logsDir = path.dirname(testLogFile)
      expect(fs.existsSync(logsDir)).toBe(true)
    })

    it('should write logs to file', async () => {
      logger.info({
        category: 'system',
        action: 'test',
        message: 'File write test'
      })

      // Give it a moment to write
      await new Promise(resolve => setTimeout(resolve, 150))

      const logContent = fs.readFileSync(testLogFile, 'utf-8')
      // Logger now writes structured JSON
      expect(logContent).toContain('"message":"File write test"')
    })
  })

  describe('Error Formatting', () => {
    it('should format Error objects correctly', () => {
      const consoleSpy = vi.spyOn(console, 'error')
      const testError = new Error('Test error message')
      testError.stack = 'Error: Test error message\\n    at test.ts:1:1'

      logger.error({
        category: 'system',
        action: 'error',
        message: 'Error occurred',
        error: testError
      })

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should handle non-Error objects in error field', () => {
      const consoleSpy = vi.spyOn(console, 'error')

      logger.error({
        category: 'system',
        action: 'error',
        message: 'Unknown error occurred',
        error: 'String error'
      } as any)

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })
})
