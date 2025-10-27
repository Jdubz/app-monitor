import React, { useState } from 'react';
import styles from './QuickActions.module.css';

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  description?: string;
  shortcut?: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning';
}

export interface QuickActionsProps {
  actions: QuickAction[];
  title?: string;
  collapsible?: boolean;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  actions,
  title = 'Quick Actions',
  collapsible = true,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleActionClick = (action: QuickAction) => {
    action.onClick();
  };

  return (
    <div className={styles.quickActions}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {collapsible && (
          <button
            className={styles.collapseButton}
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? '▼' : '▲'}
          </button>
        )}
      </div>

      {!isCollapsed && (
        <div className={styles.actionsGrid}>
          {actions.map((action) => (
            <button
              key={action.id}
              className={`${styles.actionButton} ${styles[action.variant || 'primary']}`}
              onClick={() => handleActionClick(action)}
              title={action.description}
            >
              <span className={styles.icon}>{action.icon}</span>
              <span className={styles.label}>{action.label}</span>
              {action.shortcut && (
                <span className={styles.shortcut}>{action.shortcut}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Preset action groups
export const commonActions = {
  services: [
    {
      id: 'start-all',
      label: 'Start All',
      icon: '▶️',
      description: 'Start all services',
      onClick: () => console.log('Start all services'),
    },
    {
      id: 'stop-all',
      label: 'Stop All',
      icon: '⏹️',
      description: 'Stop all services',
      variant: 'danger' as const,
      onClick: () => console.log('Stop all services'),
    },
    {
      id: 'restart-all',
      label: 'Restart All',
      icon: '🔄',
      description: 'Restart all services',
      variant: 'warning' as const,
      onClick: () => console.log('Restart all services'),
    },
  ],
  logs: [
    {
      id: 'clear-logs',
      label: 'Clear Logs',
      icon: '🗑️',
      description: 'Clear all logs',
      shortcut: 'Ctrl+L',
      onClick: () => console.log('Clear logs'),
    },
    {
      id: 'download-logs',
      label: 'Download',
      icon: '💾',
      description: 'Download logs',
      shortcut: 'Ctrl+S',
      onClick: () => console.log('Download logs'),
    },
    {
      id: 'pause-logs',
      label: 'Pause',
      icon: '⏸️',
      description: 'Pause log streaming',
      shortcut: 'Ctrl+Space',
      onClick: () => console.log('Pause logs'),
    },
  ],
  navigation: [
    {
      id: 'go-dashboard',
      label: 'Dashboard',
      icon: '🏠',
      description: 'Go to dashboard',
      onClick: () => console.log('Navigate to dashboard'),
    },
    {
      id: 'go-services',
      label: 'Services',
      icon: '⚙️',
      description: 'Go to services',
      onClick: () => console.log('Navigate to services'),
    },
    {
      id: 'go-logs',
      label: 'Logs',
      icon: '📋',
      description: 'Go to logs',
      onClick: () => console.log('Navigate to logs'),
    },
  ],
};
