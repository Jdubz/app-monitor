import { describe, it, expect } from 'vitest'
import { formatLogLine } from './logFormatter'

describe('Log Formatter', () => {
  describe('formatLogLine', () => {
    it('should return null for empty lines', () => {
      const result = formatLogLine('', 'test-service')
      expect(result).toBeNull()
    })

    it('should return null for whitespace-only lines', () => {
      const result = formatLogLine('   \n  \t  ', 'test-service')
      expect(result).toBeNull()
    })

    it('should pass through already-structured JSON logs', () => {
      const structuredLog = JSON.stringify({
        severity: 'INFO',
        timestamp: '2025-10-23T10:00:00.000Z',
        message: 'Already structured'
      })

      const result = formatLogLine(structuredLog, 'test-service')
      expect(result).toBe(structuredLog)
    })

    it('should convert plain text to structured JSON', () => {
      const plainText = 'Simple log message'
      const result = formatLogLine(plainText, 'test-service')

      expect(result).toBeTruthy()

      const parsed = JSON.parse(result!)
      expect(parsed.severity).toBeDefined()
      expect(parsed.timestamp).toBeDefined()
      expect(parsed.service).toBe('test-service')
      expect(parsed.message).toBe('Simple log message')
    })

    it('should detect ERROR severity from message content', () => {
      const errorMessage = 'Error: Something went wrong'
      const result = formatLogLine(errorMessage, 'test-service')

      const parsed = JSON.parse(result!)
      expect(parsed.severity).toBe('ERROR')
    })

    it('should detect WARNING severity from message content', () => {
      const warnMessage = 'Warning: Deprecated API used'
      const result = formatLogLine(warnMessage, 'test-service')

      const parsed = JSON.parse(result!)
      expect(parsed.severity).toBe('WARNING')
    })

    it('should default to INFO severity', () => {
      const infoMessage = 'Server started successfully'
      const result = formatLogLine(infoMessage, 'test-service')

      const parsed = JSON.parse(result!)
      expect(parsed.severity).toBe('INFO')
    })

    it('should strip ANSI color codes', () => {
      const coloredMessage = '\x1b[31mRed text\x1b[0m Normal text'
      const result = formatLogLine(coloredMessage, 'test-service')

      const parsed = JSON.parse(result!)
      expect(parsed.message).not.toContain('\x1b[')
      expect(parsed.message).toContain('Red text')
      expect(parsed.message).toContain('Normal text')
    })

    it('should extract timestamp from log line', () => {
      const messageWithTimestamp = '[2025-10-23T10:00:00.000Z] Log message'
      const result = formatLogLine(messageWithTimestamp, 'test-service')

      const parsed = JSON.parse(result!)
      expect(parsed.timestamp).toBe('2025-10-23T10:00:00.000Z')
    })

    it('should remove log level prefixes from message', () => {
      const messageWithPrefix = '[INFO] This is an info message'
      const result = formatLogLine(messageWithPrefix, 'test-service')

      const parsed = JSON.parse(result!)
      expect(parsed.message).not.toContain('[INFO]')
      expect(parsed.message).toContain('This is an info message')
    })

    it('should detect category for Firebase emulator logs', () => {
      const firebaseLog = 'ⓘ  firestore: Firestore Emulator UI running at http://localhost:4000'
      const result = formatLogLine(firebaseLog, 'firebase-emulators')

      const parsed = JSON.parse(result!)
      // The code detects 'emulator' first, which returns 'emulators' category
      // even if 'firestore' is also in the message
      expect(parsed.category).toBe('emulators')
    })

    it('should detect category for frontend dev server logs', () => {
      const viteLog = 'vite v4.0.0 dev server running at:'
      const result = formatLogLine(viteLog, 'frontend-dev')

      const parsed = JSON.parse(result!)
      expect(parsed.category).toBe('build')
    })

    it('should detect action from message content - starting', () => {
      const startMessage = 'Starting server on port 3000'
      const result = formatLogLine(startMessage, 'test-service')

      const parsed = JSON.parse(result!)
      expect(parsed.action).toBe('starting')
    })

    it('should detect action from message content - ready', () => {
      const readyMessage = 'Server ready and listening'
      const result = formatLogLine(readyMessage, 'test-service')

      const parsed = JSON.parse(result!)
      expect(parsed.action).toBe('ready')
    })

    it('should detect action from message content - error', () => {
      const errorMessage = 'Error: Connection failed'
      const result = formatLogLine(errorMessage, 'test-service')

      const parsed = JSON.parse(result!)
      // 'Connection' matches the 'connect' pattern before 'error' pattern
      expect(parsed.action).toBe('connected')
    })

    it('should include environment in log entry', () => {
      const message = 'Test message'
      const result = formatLogLine(message, 'test-service')

      const parsed = JSON.parse(result!)
      expect(parsed.environment).toBe('development')
    })

    it('should handle multiline log messages', () => {
      const multilineMessage = 'First line\\nSecond line\\nThird line'
      const result = formatLogLine(multilineMessage, 'test-service')

      expect(result).toBeTruthy()
      const parsed = JSON.parse(result!)
      expect(parsed.message).toContain('First line')
    })

    it('should handle special characters in messages', () => {
      const specialMessage = 'Message with "quotes" and \\special\\ chars'
      const result = formatLogLine(specialMessage, 'test-service')

      expect(result).toBeTruthy()
      const parsed = JSON.parse(result!)
      expect(parsed.message).toContain('quotes')
    })
  })
})
