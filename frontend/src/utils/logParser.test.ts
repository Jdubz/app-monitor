import { describe, it, expect } from 'vitest'

describe('DevMonitor Frontend', () => {
  it('should pass basic test', () => {
    expect(true).toBe(true)
  })

  it('should have access to testing utilities', () => {
    expect(typeof describe).toBe('function')
    expect(typeof it).toBe('function')
    expect(typeof expect).toBe('function')
  })
})

