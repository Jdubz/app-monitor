import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useServices } from './hooks/useServices';
import { LogProvider } from './contexts/LogContext';
import { Header, MainLayout } from './components/layout';
import { DevBotsTab } from './components/tabs';
import { ErrorBoundary } from './components/common';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { PasswordGate } from './components/PasswordGate';

// Simplified app - single dev-bots intervention panel
function AppContent() {
  const { socket } = useServices();

  return (
    <MainLayout>
      <Header />
      <div className="flex flex-col gap-6">
        <div className="h-full">
          <Routes>
            <Route path="/" element={<DevBotsTab socket={socket} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
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
