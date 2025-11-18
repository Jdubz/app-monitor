import { useState, useEffect } from 'react';
import { useEnhancedSocket } from './useEnhancedSocket';

export interface PhaseState {
  phase: number;
  status: 'ready' | 'running' | 'validating' | 'recovering' | 'complete' | 'failed';
  attempt?: number;
  errors?: string[];
  nextPhase?: number;
  reason?: string;
}

export interface PhaseEvent {
  taskId: string;
  phaseIndex: number;
  phaseName?: string;
  attempt?: number;
  errors?: string[];
  nextPhase?: number;
  action?: string;
  reason?: string;
}

export function usePhaseUpdates(taskId: string | undefined) {
  const { socket } = useEnhancedSocket();
  const [phaseState, setPhaseState] = useState<PhaseState | null>(null);

  useEffect(() => {
    if (!socket || !taskId) return;

    const handlePhaseStarted = (data: PhaseEvent) => {
      if (data.taskId === taskId) {
        setPhaseState({
          phase: data.phaseIndex,
          status: 'running',
          attempt: data.attempt,
        });
      }
    };

    const handlePhaseValidating = (data: PhaseEvent) => {
      if (data.taskId === taskId) {
        setPhaseState(prev => prev ? { ...prev, status: 'validating' } : null);
      }
    };

    const handlePhaseValidationFailed = (data: PhaseEvent) => {
      if (data.taskId === taskId) {
        setPhaseState(prev => prev ? { 
          ...prev, 
          status: 'failed',
          errors: data.errors 
        } : null);
      }
    };

    const handlePhaseRecovering = (data: PhaseEvent) => {
      if (data.taskId === taskId) {
        setPhaseState(prev => prev ? { ...prev, status: 'recovering' } : null);
      }
    };

    const handlePhaseCompleted = (data: PhaseEvent) => {
      if (data.taskId === taskId) {
        setPhaseState({
          phase: data.nextPhase || data.phaseIndex + 1,
          status: 'complete',
          nextPhase: data.nextPhase,
          reason: data.reason,
        });
      }
    };

    // Subscribe to events
    socket.on('phase:started', handlePhaseStarted);
    socket.on('phase:validating', handlePhaseValidating);
    socket.on('phase:validation_failed', handlePhaseValidationFailed);
    socket.on('phase:recovering', handlePhaseRecovering);
    socket.on('phase:completed', handlePhaseCompleted);

    // Cleanup
    return () => {
      socket.off('phase:started', handlePhaseStarted);
      socket.off('phase:validating', handlePhaseValidating);
      socket.off('phase:validation_failed', handlePhaseValidationFailed);
      socket.off('phase:recovering', handlePhaseRecovering);
      socket.off('phase:completed', handlePhaseCompleted);
    };
  }, [socket, taskId]);

  return phaseState;
}
