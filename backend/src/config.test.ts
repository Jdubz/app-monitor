import { describe, it, expect } from 'vitest'
import { config } from './config'

describe('Config', () => {
  describe('Basic Configuration', () => {
    it('should have required configuration', () => {
      expect(config.port).toBeDefined()
      expect(config.corsOrigin).toBeDefined()
      expect(config.nodeEnv).toBeDefined()
      expect(config.workerLogStreamsConfig).toBeDefined()
    })

    it('should have valid port number', () => {
      expect(config.port).toBeGreaterThan(0)
      expect(config.port).toBeLessThan(65536)
    })

    it('should have CORS origin configured', () => {
      expect(config.corsOrigin).toBeTruthy()
      expect(typeof config.corsOrigin).toBe('string')
    })

    it('should have node environment set', () => {
      expect(config.nodeEnv).toBeTruthy()
      expect(typeof config.nodeEnv).toBe('string')
    })

    it('should have worker log streams config path', () => {
      expect(config.workerLogStreamsConfig).toBeTruthy()
      expect(typeof config.workerLogStreamsConfig).toBe('string')
    })
  })
})
