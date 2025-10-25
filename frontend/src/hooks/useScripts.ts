import { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { Script, ScriptExecution, ScriptExecutionSummary } from '../types/script.types';
import * as api from '../services/api';

export function useScripts(socket: Socket | null) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [executions, setExecutions] = useState<Map<string, ScriptExecution>>(new Map());
  const [activeExecutions, setActiveExecutions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch available scripts
  useEffect(() => {
    const fetchScripts = async () => {
      try {
        const data = await api.getScripts();
        setScripts(data);
      } catch (err) {
        setError('Failed to load scripts');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchScripts();
  }, []);

  // Socket.IO listeners for real-time updates
  useEffect(() => {
    if (!socket) return;

    socket.on('script:started', (execution: ScriptExecution) => {
      console.log('Script started:', execution);
      setExecutions(prev => new Map(prev).set(execution.id, execution));
      setActiveExecutions(prev => new Set(prev).add(execution.id));
    });

    socket.on('script:output', (data: { executionId: string; scriptId: string; line: string }) => {
      setExecutions(prev => {
        const exec = prev.get(data.executionId);
        if (!exec) return prev;

        const updated = new Map(prev);
        updated.set(data.executionId, {
          ...exec,
          output: [...exec.output, data.line],
        });
        return updated;
      });
    });

    socket.on('script:completed', (execution: ScriptExecution) => {
      console.log('Script completed:', execution);
      setExecutions(prev => new Map(prev).set(execution.id, execution));
      setActiveExecutions(prev => {
        const updated = new Set(prev);
        updated.delete(execution.id);
        return updated;
      });
    });

    socket.on('script:failed', (execution: ScriptExecution) => {
      console.log('Script failed:', execution);
      setExecutions(prev => new Map(prev).set(execution.id, execution));
      setActiveExecutions(prev => {
        const updated = new Set(prev);
        updated.delete(execution.id);
        return updated;
      });
    });

    socket.on('script:killed', (execution: ScriptExecution) => {
      console.log('Script killed:', execution);
      setExecutions(prev => new Map(prev).set(execution.id, execution));
      setActiveExecutions(prev => {
        const updated = new Set(prev);
        updated.delete(execution.id);
        return updated;
      });
    });

    return () => {
      socket.off('script:started');
      socket.off('script:output');
      socket.off('script:completed');
      socket.off('script:failed');
      socket.off('script:killed');
    };
  }, [socket]);

  const executeScript = async (scriptId: string): Promise<{ executionId: string }> => {
    try {
      const result = await api.executeScript(scriptId);
      return { executionId: result.execution.id };
    } catch (err) {
      console.error('Failed to execute script:', err);
      throw err;
    }
  };

  const killScriptExecution = async (executionId: string) => {
    try {
      await api.killScript(executionId);
    } catch (err) {
      console.error('Failed to kill script:', err);
      throw err;
    }
  };

  return {
    scripts,
    executions: Array.from(executions.values()),
    activeExecutions,
    loading,
    error,
    executeScript,
    killScript: killScriptExecution,
  };
}
