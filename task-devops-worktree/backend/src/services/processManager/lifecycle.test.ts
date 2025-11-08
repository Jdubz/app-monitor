/**
 * Tests for ProcessLifecycle state machine
 */

import { describe, it, expect } from 'vitest';
import { ProcessLifecycle } from './lifecycle.js';

describe('ProcessLifecycle', () => {
  describe('State Transitions', () => {
    it('should start in stopped state', () => {
      const lifecycle = new ProcessLifecycle();
      expect(lifecycle.getState()).toBe('stopped');
    });

    it('should allow stopped -> starting transition', () => {
      const lifecycle = new ProcessLifecycle();
      lifecycle.transitionTo('starting');
      expect(lifecycle.getState()).toBe('starting');
    });

    it('should allow starting -> running transition', () => {
      const lifecycle = new ProcessLifecycle('starting');
      lifecycle.transitionTo('running');
      expect(lifecycle.getState()).toBe('running');
    });

    it('should allow running -> stopping transition', () => {
      const lifecycle = new ProcessLifecycle('running');
      lifecycle.transitionTo('stopping');
      expect(lifecycle.getState()).toBe('stopping');
    });

    it('should allow stopping -> stopped transition', () => {
      const lifecycle = new ProcessLifecycle('stopping');
      lifecycle.transitionTo('stopped');
      expect(lifecycle.getState()).toBe('stopped');
    });

    it('should allow any state -> error transition', () => {
      const states = ['stopped', 'starting', 'running', 'stopping'] as const;
      
      for (const state of states) {
        const lifecycle = new ProcessLifecycle(state);
        lifecycle.transitionTo('error');
        expect(lifecycle.getState()).toBe('error');
      }
    });

    it('should allow error -> stopped transition', () => {
      const lifecycle = new ProcessLifecycle('error');
      lifecycle.transitionTo('stopped');
      expect(lifecycle.getState()).toBe('stopped');
    });

    it('should allow error -> starting transition (retry)', () => {
      const lifecycle = new ProcessLifecycle('error');
      lifecycle.transitionTo('starting');
      expect(lifecycle.getState()).toBe('starting');
    });
  });

  describe('Invalid Transitions', () => {
    it('should reject stopped -> running transition', () => {
      const lifecycle = new ProcessLifecycle('stopped');
      expect(() => lifecycle.transitionTo('running')).toThrow(
        'Invalid state transition: stopped -> running'
      );
    });

    it('should reject running -> starting transition', () => {
      const lifecycle = new ProcessLifecycle('running');
      expect(() => lifecycle.transitionTo('starting')).toThrow(
        'Invalid state transition: running -> starting'
      );
    });

    it('should reject stopped -> stopping transition', () => {
      const lifecycle = new ProcessLifecycle('stopped');
      expect(() => lifecycle.transitionTo('stopping')).toThrow(
        'Invalid state transition: stopped -> stopping'
      );
    });
  });

  describe('Transition Validation', () => {
    it('should correctly validate allowed transitions', () => {
      const lifecycle = new ProcessLifecycle('stopped');
      expect(lifecycle.canTransitionTo('starting')).toBe(true);
      expect(lifecycle.canTransitionTo('error')).toBe(true);
      expect(lifecycle.canTransitionTo('running')).toBe(false);
    });

    it('should correctly validate from running state', () => {
      const lifecycle = new ProcessLifecycle('running');
      expect(lifecycle.canTransitionTo('stopping')).toBe(true);
      expect(lifecycle.canTransitionTo('error')).toBe(true);
      expect(lifecycle.canTransitionTo('starting')).toBe(false);
      expect(lifecycle.canTransitionTo('stopped')).toBe(false);
    });
  });

  describe('Force Transition', () => {
    it('should allow force transition to any state', () => {
      const lifecycle = new ProcessLifecycle('stopped');
      lifecycle.forceTransition('running');
      expect(lifecycle.getState()).toBe('running');
    });

    it('should bypass validation on force transition', () => {
      const lifecycle = new ProcessLifecycle('running');
      lifecycle.forceTransition('starting');
      expect(lifecycle.getState()).toBe('starting');
    });
  });
});
