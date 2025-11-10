import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useServices } from './hooks/useServices';
import { getEnvironments } from './services/api';
import { Environment } from './types/log.types';
import { LogProvider } from './contexts/LogContext';
import { Header, MainLayout, TabNav, TabContent } from './components/layout';
import { LocalTab, DeployedServicesTab, DevBotsTab } from './components/tabs';
import { ErrorBoundary, LoadingSpinner, InlineError } from './components/common';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { PasswordGate } from './components/PasswordGate';

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
      <div className="flex flex-col gap-6">
        <TabNav />
        <TabContent>
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
              <InlineError
                message={error}
                onDismiss={() => setError(null)}
              />
            </div>
          )}

          {isLoading ? (
            <div className="flex h-[360px] flex-col items-center justify-center gap-4">
              <LoadingSpinner message="Loading environments..." />
            </div>
          ) : (
            <div className="h-full">
              <Routes>
                <Route path="/" element={<Navigate to="/local" replace />} />
                <Route path="/local" element={<LocalTab />} />
                <Route
                  path="/deployed"
                  element={<DeployedServicesTab socket={socket} environments={environments} />}
                />
                <Route path="/dev-bots" element={<DevBotsTab socket={socket} />} />
                <Route path="*" element={<Navigate to="/local" replace />} />
              </Routes>
            </div>
          )}
        </TabContent>
      </div>
    </MainLayout>
  );
}

function App() {
  const { socket } = useServices();

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <PasswordGate>
          <LogProvider socket={socket}>
            <Router>
              <AppContent />
            </Router>
          </LogProvider>
        </PasswordGate>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
