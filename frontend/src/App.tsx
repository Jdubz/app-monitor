import { useState, useEffect } from 'react';
import { useServices } from './hooks/useServices';
import { getEnvironments } from './services/api';
import { Environment } from './types/log.types';
import { LogProvider } from './contexts/LogContext';
import { Header, MainLayout, TabNav, TabContent, TabType } from './components/layout';
import { LocalTab, ScriptsTab, EnvironmentTab, SystemHealthTab, ClaudeWorkersTab } from './components/tabs';
import { ErrorBoundary, LoadingSpinner, InlineError } from './components/common';
import './App.css';

function App() {
  const { socket } = useServices();
  const [activeTab, setActiveTab] = useState<TabType>('local');
  const [environments, setEnvironments] = useState<Record<string, Environment>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEnvironments = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const envs = await getEnvironments();
        setEnvironments(envs);
      } catch (error) {
        console.error('Failed to fetch environments:', error);
        setError(error instanceof Error ? error.message : 'Failed to load environments');
      } finally {
        setIsLoading(false);
      }
    };

    fetchEnvironments();
  }, []);

  return (
    <ErrorBoundary>
      <LogProvider socket={socket}>
        <MainLayout>
          <Header />
          <TabContent>
            <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
            
            {error && (
              <div style={{ padding: 'var(--spacing-md)' }}>
                <InlineError 
                  message={error}
                  onDismiss={() => setError(null)}
                />
              </div>
            )}
            
            {isLoading ? (
              <div style={{ padding: 'var(--spacing-2xl)', textAlign: 'center' }}>
                <LoadingSpinner message="Loading environments..." />
              </div>
            ) : (
              <div className="tab-panel">
                {activeTab === 'local' && <LocalTab />}
                {activeTab === 'scripts' && <ScriptsTab socket={socket} />}
                {activeTab === 'staging' && <EnvironmentTab socket={socket} environment="staging" environments={environments} />}
                {activeTab === 'production' && <EnvironmentTab socket={socket} environment="production" environments={environments} />}
                {activeTab === 'health' && <SystemHealthTab />}
                {activeTab === 'claude-workers' && <ClaudeWorkersTab socket={socket} />}
              </div>
            )}
          </TabContent>
        </MainLayout>
      </LogProvider>
    </ErrorBoundary>
  );
}

export default App;
