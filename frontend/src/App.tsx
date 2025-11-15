import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useServices } from './hooks/useServices';
import { LogProvider } from './contexts/LogContext';
import { Header, MainLayout } from './components/layout';
import { DevMonitorShell } from './components/monitor/DevMonitorShell';
import { ErrorBoundary } from './components/common';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { PasswordGate } from './components/PasswordGate';

// App content - tabbed monitor layout
function AppContent() {
  const { socket } = useServices();

  return (
    <MainLayout>
      <Header />
      <div className="flex flex-col gap-6">
        <div className="h-full">
          <Routes>
            <Route path="/monitor/*" element={<DevMonitorShell socket={socket} />} />
            <Route path="/" element={<Navigate to="/monitor/dev-bots" replace />} />
            <Route path="*" element={<Navigate to="/monitor/dev-bots" replace />} />
          </Routes>
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
