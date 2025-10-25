import { useState } from 'react';
import { Socket } from 'socket.io-client';
import { useScripts } from '../hooks/useScripts';
import ScriptCard from './ScriptCard';
import ScriptOutputModal from './ScriptOutputModal';
import { ScriptCategory } from '../types/script.types';

interface ScriptsPanelProps {
  socket: Socket | null;
}

export default function ScriptsPanel({ socket }: ScriptsPanelProps) {
  const { scripts, executions, activeExecutions, loading, error, executeScript } = useScripts(socket);
  const [modalExecutionId, setModalExecutionId] = useState<string | null>(null);
  const [modalScriptName, setModalScriptName] = useState<string>('');

  const handleExecuteScript = async (scriptId: string) => {
    try {
      const script = scripts.find(s => s.id === scriptId);
      const result = await executeScript(scriptId);

      // Open modal with execution ID
      setModalExecutionId(result.executionId);
      setModalScriptName(script?.displayName || scriptId);
    } catch (err) {
      console.error('Failed to execute script:', err);
      alert('Failed to execute script. Check console for details.');
    }
  };

  const closeModal = () => {
    setModalExecutionId(null);
    setModalScriptName('');
  };

  if (loading) {
    return <div>Loading scripts...</div>;
  }

  if (error) {
    return <div style={{ color: '#c92a2a' }}>{error}</div>;
  }

  const categories: { name: string; key: ScriptCategory; icon: string }[] = [
    { name: 'Build', key: 'build', icon: '📦' },
    { name: 'Test', key: 'test', icon: '🧪' },
    { name: 'Quality', key: 'quality', icon: '🔍' },
    { name: 'Database', key: 'database', icon: '🗄️' },
    { name: 'Utility', key: 'utility', icon: '🛠️' },
  ];

  return (
    <div>
      {/* Active Executions */}
      {activeExecutions.size > 0 && (
        <div style={{
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: '#e7f5ff',
          borderRadius: '8px',
          border: '2px solid #339af0',
        }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600 }}>
            ⏳ Running ({activeExecutions.size})
          </h3>
          {executions
            .filter(exec => activeExecutions.has(exec.id))
            .map(exec => (
              <div key={exec.id} style={{
                marginTop: '8px',
                fontSize: '14px',
                color: '#1971c2',
              }}>
                {exec.config.displayName} - {exec.output.length} lines
              </div>
            ))}
        </div>
      )}

      {/* Script Categories */}
      {categories.map(category => {
        const categoryScripts = scripts.filter(s => s.category === category.key);

        if (categoryScripts.length === 0) return null;

        return (
          <div key={category.key} style={{ marginBottom: '32px' }}>
            <h2 style={{
              margin: '0 0 16px 0',
              fontSize: '18px',
              fontWeight: 600,
              color: '#333',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <span>{category.icon}</span>
              {category.name}
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px',
            }}>
              {categoryScripts.map(script => (
                <ScriptCard
                  key={script.id}
                  script={script}
                  isRunning={Array.from(activeExecutions).some(id =>
                    executions.find(e => e.id === id)?.scriptId === script.id
                  )}
                  onExecute={handleExecuteScript}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Script Output Modal */}
      {modalExecutionId && (
        <ScriptOutputModal
          socket={socket}
          executionId={modalExecutionId}
          scriptName={modalScriptName}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
