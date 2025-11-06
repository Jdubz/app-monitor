import { useState } from 'react';
import { Socket } from 'socket.io-client';
import { useScripts } from '../hooks/useScripts';
import ScriptCard from './ScriptCard';
import ScriptOutputModal from './ScriptOutputModal';
import { ScriptCategory } from '../types/script.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
    return (
      <div className="rounded-xl border border-border/60 bg-card/70 px-6 py-10 text-center text-sm text-muted-foreground">
        Loading scripts…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/15 px-6 py-4 text-sm text-destructive-foreground shadow">
        {error}
      </div>
    );
  }

  const categories: { name: string; key: ScriptCategory; icon: string }[] = [
    { name: 'Build', key: 'build', icon: '📦' },
    { name: 'Test', key: 'test', icon: '🧪' },
    { name: 'Quality', key: 'quality', icon: '🔍' },
    { name: 'Database', key: 'database', icon: '🗄️' },
    { name: 'Utility', key: 'utility', icon: '🛠️' },
  ];

  return (
    <div className="space-y-8">
      {activeExecutions.size > 0 && (
        <Card className="border border-sky-500/40 bg-sky-500/10 text-sky-100 shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
              ⏳ Running ({activeExecutions.size})
            </CardTitle>
            <Badge variant="info" className="w-fit uppercase tracking-[0.3em]">
              Active Executions
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {executions
              .filter(exec => activeExecutions.has(exec.id))
              .map(exec => (
                <div key={exec.id} className="flex items-center justify-between rounded-lg border border-sky-500/30 bg-black/30 px-3 py-2 font-mono text-xs">
                  <span>{exec.config.displayName}</span>
                  <span className="text-sky-200/80">{exec.output.length} lines</span>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {categories.map(category => {
        const categoryScripts = scripts.filter(s => s.category === category.key);
        if (categoryScripts.length === 0) return null;

        return (
          <section key={category.key} className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-lg">{category.icon}</span>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {category.name}
              </h2>
              <Badge variant="outline" className="border-border/60 bg-background/40 text-xs uppercase tracking-[0.3em]">
                {categoryScripts.length} scripts
              </Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {categoryScripts.map(script => (
                <ScriptCard
                  key={script.id}
                  script={script}
                  isRunning={Array.from(activeExecutions).some(id =>
                    executions.find(e => e.id === id)?.scriptId === script.id,
                  )}
                  onExecute={handleExecuteScript}
                />
              ))}
            </div>
          </section>
        );
      })}

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
