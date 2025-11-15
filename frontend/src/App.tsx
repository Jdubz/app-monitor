import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useServices } from './hooks/useServices';
import { LogProvider } from './contexts/LogContext';
import { Header, MainLayout } from './components/layout';
import { DevBotsTab } from './components/tabs';
import { DevMonitorShell } from './components/monitor/DevMonitorShell';
import { ErrorBoundary } from './components/common';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { PasswordGate } from './components/PasswordGate';

// App content with optional tabbed monitor layout
function AppContent() {
  const { socket } = useServices();

  // Feature flag for new tabbed monitor layout
  const enableTabbedLayout =
    (import.meta.env.VITE_FEATURE_TABBED_MONITOR_LAYOUT ?? 'true').toString().toLowerCase() !== 'false';

  return (
    <MainLayout>
      <Header />
      <div className="flex flex-col gap-6">
        <div className="h-full">
          {enableTabbedLayout ? (
            <Routes>
              <Route path="/monitor/*" element={<DevMonitorShell socket={socket} />} />
              <Route path="/" element={<Navigate to="/monitor/dev-bots" replace />} />
              <Route path="*" element={<Navigate to="/monitor/dev-bots" replace />} />
            </Routes>
          ) : (
            <Routes>
              <Route path="/" element={<DevBotsTab socket={socket} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </div>
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
// Updated: Fri Nov 14 07:11:36 PM PST 2025
