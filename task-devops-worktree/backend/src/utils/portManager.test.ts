import { describe, it, expect } from 'vitest'
import { isPortInUse, getPortInfo } from './portManager'

describe('Port Manager Utilities', () => {
  describe('isPortInUse', () => {
    it('should return a boolean', async () => {
      // Use a high port that's unlikely to be in use
      const result = await isPortInUse(59999)
      expect(typeof result).toBe('boolean')
    })

    it('should handle invalid port numbers gracefully', async () => {
      // Test with port 0 (invalid)
      const result = await isPortInUse(0)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('getPortInfo', () => {
    it('should return port info structure', async () => {
      const info = await getPortInfo(59999)

      expect(info).toBeDefined()
      expect(info.port).toBe(59999)
      expect(info.inUse).toBeDefined()
      expect(typeof info.inUse).toBe('boolean')

      if (info.inUse) {
        expect(typeof info.pid).toBe('number')
      } else {
        expect(info.pid).toBeNull()
      }
    })

    it('should return consistent results for same port', async () => {
      const info1 = await getPortInfo(60000)
      const info2 = await getPortInfo(60000)

      expect(info1.inUse).toBe(info2.inUse)
      expect(info1.port).toBe(info2.port)
    })
  })
})
