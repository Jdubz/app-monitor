/**
 * Process lifecycle state machine
 * Handles transitions between process states
 */

export type ProcessState =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

export interface StateTransition {
  from: ProcessState;
  to: ProcessState;
  action?: string;
}

export class ProcessLifecycle {
  private state: ProcessState = "stopped";

  // Valid state transitions
  private static transitions: Map<ProcessState, Set<ProcessState>> = new Map<
    ProcessState,
    Set<ProcessState>
  >([
    ["stopped", new Set<ProcessState>(["starting", "error"])],
    ["starting", new Set<ProcessState>(["running", "error", "stopped"])],
    ["running", new Set<ProcessState>(["stopping", "error"])],
    ["stopping", new Set<ProcessState>(["stopped", "error"])],
    ["error", new Set<ProcessState>(["stopped", "starting"])],
  ]);

  constructor(initialState: ProcessState = "stopped") {
    this.state = initialState;
  }

  /**
   * Get current state
   */
  getState(): ProcessState {
    return this.state;
  }

  /**
   * Check if a transition is valid
   */
  canTransitionTo(newState: ProcessState): boolean {
    const allowedStates = ProcessLifecycle.transitions.get(this.state);
    return allowedStates?.has(newState) ?? false;
  }

  /**
   * Transition to a new state
   * @throws Error if transition is invalid
   */
  transitionTo(newState: ProcessState): void {
    if (!this.canTransitionTo(newState)) {
      throw new Error(`Invalid state transition: ${this.state} -> ${newState}`);
    }
    this.state = newState;
  }

  /**
   * Force transition (bypass validation)
   * Use only for error recovery
   */
  forceTransition(newState: ProcessState): void {
    this.state = newState;
  }
}
