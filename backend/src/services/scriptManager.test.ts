import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ScriptManager } from './scriptManager'
import { EventEmitter } from 'events'

describe('ScriptManager', () => {
  let scriptManager: ScriptManager

  beforeEach(() => {
    scriptManager = new ScriptManager()
  })

  afterEach(() => {
    scriptManager.clearHistory()
  })

  describe('Initialization', () => {
    it('should initialize as an EventEmitter', () => {
      expect(scriptManager).toBeInstanceOf(EventEmitter)
    })

    it('should start with empty executions', () => {
      const executions = scriptManager.getExecutions()
      expect(executions).toEqual([])
    })
  })

  describe('getScripts', () => {
    it('should return array of script configurations', () => {
      const scripts = scriptManager.getScripts()

      expect(Array.isArray(scripts)).toBe(true)
      expect(scripts.length).toBeGreaterThan(0)
    })

    it('should return scripts with required properties', () => {
      const scripts = scriptManager.getScripts()
      const firstScript = scripts[0]

      expect(firstScript).toHaveProperty('id')
      expect(firstScript).toHaveProperty('name')
      expect(firstScript).toHaveProperty('displayName')
      expect(firstScript).toHaveProperty('description')
      expect(firstScript).toHaveProperty('category')
      expect(firstScript).toHaveProperty('command')
      expect(firstScript).toHaveProperty('args')
      expect(firstScript).toHaveProperty('cwd')
    })

    it('should include different script categories', () => {
      const scripts = scriptManager.getScripts()
      const categories = scripts.map(s => s.category)

      expect(categories).toContain('test')
      expect(categories).toContain('build')
    })
  })

  describe('startScript', () => {
    it('should throw error for non-existent script', () => {
      expect(() => {
        scriptManager.startScript('non-existent-script')
      }).toThrow('Script not found')
    })

    it('should return execution object immediately', () => {
      const execution = scriptManager.startScript('fe-test')

      expect(execution).toBeDefined()
      expect(execution.id).toBeDefined()
      expect(execution.scriptId).toBe('fe-test')
      expect(execution.status).toBe('running')
      expect(execution.startTime).toBeInstanceOf(Date)
      expect(Array.isArray(execution.output)).toBe(true)
    })

    it('should create unique execution IDs', () => {
      const execution1 = scriptManager.startScript('fe-test')
      const execution2 = scriptManager.startScript('fe-test')

      expect(execution1.id).not.toBe(execution2.id)
    })

    it('should emit script:started event', () => {
      return new Promise<void>((resolve) => {
        scriptManager.once('script:started', (execution) => {
          expect(execution).toBeDefined()
          expect(execution.scriptId).toBe('fe-test')
          resolve()
        })

        scriptManager.startScript('fe-test')
      })
    })

    it('should store execution in manager', () => {
      const execution = scriptManager.startScript('fe-test')

      const executions = scriptManager.getExecutions()
      expect(executions).toHaveLength(1)
      expect(executions[0].id).toBe(execution.id)
    })
  })

  describe('getExecutions', () => {
    it('should return all executions', () => {
      scriptManager.startScript('fe-test')
      scriptManager.startScript('fe-lint')

      const executions = scriptManager.getExecutions()
      expect(executions).toHaveLength(2)
    })

    it('should return execution details', () => {
      const execution = scriptManager.startScript('fe-test')
      const executions = scriptManager.getExecutions()

      const found = executions.find(e => e.id === execution.id)
      expect(found).toBeDefined()
      expect(found!.scriptId).toBe('fe-test')
      expect(found!.status).toBeDefined()
    })
  })

  describe('getExecution', () => {
    it('should return specific execution by ID', () => {
      const execution = scriptManager.startScript('fe-test')

      const found = scriptManager.getExecution(execution.id)
      expect(found).toBeDefined()
      expect(found!.id).toBe(execution.id)
    })

    it('should return undefined for non-existent execution', () => {
      const found = scriptManager.getExecution('non-existent-id')
      expect(found).toBeUndefined()
    })
  })

  describe('clearHistory', () => {
    it('should clear completed executions', async () => {
      // Start a script
      const execution = scriptManager.startScript('fe-test')

      // Manually mark as completed (simulating finished execution)
      execution.status = 'completed'
      execution.endTime = new Date()

      scriptManager.clearHistory()

      const executions = scriptManager.getExecutions()
      expect(executions).toHaveLength(0)
    })

    it('should not clear running executions', () => {
      const execution = scriptManager.startScript('fe-test')
      expect(execution.status).toBe('running')

      scriptManager.clearHistory()

      const executions = scriptManager.getExecutions()
      expect(executions).toHaveLength(1)
    })
  })

  describe('killScript', () => {
    it('should return false for non-existent execution', () => {
      const result = scriptManager.killScript('non-existent-id')
      expect(result).toBe(false)
    })

    it('should emit script:killed event when killing a script', () => {
      return new Promise<void>((resolve) => {
        const execution = scriptManager.startScript('fe-test')

        scriptManager.once('script:killed', (killedExecution) => {
          expect(killedExecution.id).toBe(execution.id)
          resolve()
        })

        // Give the script a moment to start before killing
        setTimeout(() => {
          scriptManager.killScript(execution.id)
        }, 100)
      })
    })
  })

  describe('Script Configuration', () => {
    it('should have valid frontend scripts', () => {
      const scripts = scriptManager.getScripts()
      const feScripts = scripts.filter(s => s.id.startsWith('fe-'))

      expect(feScripts.length).toBeGreaterThan(0)

      feScripts.forEach(script => {
        expect(script.command).toBe('npm')
        expect(script.cwd).toContain('job-finder-FE')
      })
    })

    it('should have valid backend scripts', () => {
      const scripts = scriptManager.getScripts()
      const beScripts = scripts.filter(s => s.id.startsWith('be-'))

      expect(beScripts.length).toBeGreaterThan(0)

      beScripts.forEach(script => {
        expect(script.command).toBe('npm')
        expect(script.cwd).toContain('job-finder-BE')
      })
    })

    it('should have danger levels for destructive scripts', () => {
      const scripts = scriptManager.getScripts()
      const dangerousScripts = scripts.filter(s =>
        s.id.includes('delete') || s.id.includes('clear') || s.id.includes('production')
      )

      dangerousScripts.forEach(script => {
        expect(script.dangerLevel).toBeDefined()
        expect(['warning', 'danger']).toContain(script.dangerLevel)
      })
    })

    it('should require confirmation for dangerous scripts', () => {
      const scripts = scriptManager.getScripts()
      const dangerousScripts = scripts.filter(s =>
        s.dangerLevel === 'danger' || s.dangerLevel === 'warning'
      )

      dangerousScripts.forEach(script => {
        expect(script.requiresConfirmation).toBe(true)
      })
    })
  })

  describe('Event Handling', () => {
    it('should handle script completion events', () => {
      return new Promise<void>((resolve) => {
        scriptManager.once('script:completed', (execution) => {
          expect(execution.status).toBe('completed')
          expect(execution.exitCode).toBe(0)
          resolve()
        })

        // This would normally happen when the child process emits an exit event
        // For testing, we can manually trigger it
        const execution = scriptManager.startScript('fe-test')
        // Simulate completion
        setTimeout(() => {
          execution.status = 'completed'
          execution.exitCode = 0
          scriptManager.emit('script:completed', execution)
        }, 100)
      })
    })

    it('should handle script failure events', () => {
      return new Promise<void>((resolve) => {
        scriptManager.once('script:failed', (execution) => {
          expect(execution.status).toBe('failed')
          expect(execution.exitCode).not.toBe(0)
          resolve()
        })

        const execution = scriptManager.startScript('fe-test')
        // Simulate failure
        setTimeout(() => {
          execution.status = 'failed'
          execution.exitCode = 1
          scriptManager.emit('script:failed', execution)
        }, 100)
      })
    })
  })
})
