import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useServices } from './hooks/useServices';
import { getEnvironments } from './services/api';
import { Environment } from './types/log.types';
import { LogProvider } from './contexts/LogContext';
import { Header, MainLayout, TabNav, TabContent } from './components/layout';
import { LocalTab, ScriptsTab, DeployedServicesTab, DevBotsTab } from './components/tabs';
import { ErrorBoundary, LoadingSpinner, InlineError } from './components/common';
import './App.css';

// Component that handles routing and tab state
function AppContent() {
  const { socket } = useServices();
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
    <MainLayout>
      <Header />
      <TabContent>
        <TabNav />
        
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
            <Routes>
              <Route path="/" element={<Navigate to="/local" replace />} />
              <Route path="/local" element={<LocalTab />} />
              <Route path="/scripts" element={<ScriptsTab socket={socket} />} />
              <Route path="/deployed" element={<DeployedServicesTab socket={socket} environments={environments} />} />
              <Route path="/dev-bots" element={<DevBotsTab socket={socket} />} />
              <Route path="*" element={<Navigate to="/local" replace />} />
            </Routes>
          </div>
        )}
      </TabContent>
    </MainLayout>
  );
}

function App() {
  const { socket } = useServices();

  return (
    <ErrorBoundary>
      <LogProvider socket={socket}>
        <Router>
          <AppContent />
        </Router>
      </LogProvider>
    </ErrorBoundary>
  );
}

export default App;
