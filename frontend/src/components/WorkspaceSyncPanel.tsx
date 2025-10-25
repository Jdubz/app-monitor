import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import styles from './WorkspaceSyncPanel.module.css';

interface SyncStatus {
  isRunning: boolean;
  syncInProgress: boolean;
  lastSyncTime?: string;
  baseDir: string;
  repositories: string[];
  workers: string[];
  conflictStrategy: string;
}

interface SyncResult {
  successful: Array<{
    worker?: string;
    repo: string;
    action: string;
  }>;
  conflicts: Array<{
    worker: string;
    repo: string;
    path: string;
    timestamp: string;
    strategy: string;
    status?: string;
  }>;
  errors: Array<{
    worker?: string;
    repo: string;
    error: string;
  }>;
  skipped: Array<{
    worker?: string;
    repo: string;
    reason: string;
  }>;
}

interface WorkspaceSyncPanelProps {
  onStatusChange?: (status: any) => void;
}

export const WorkspaceSyncPanel: React.FC<WorkspaceSyncPanelProps> = ({
  onStatusChange
}) => {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [syncOptions, setSyncOptions] = useState({
    dryRun: false,
    verbose: false,
    conflictStrategy: 'auto-merge' as 'auto-merge' | 'stash' | 'abort'
  });

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await api.get('/claude-workers/workspace-sync/status');
      setStatus(response.data);
      setError(null);
      if (onStatusChange) {
        onStatusChange(response.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch sync status');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const triggerSync = async () => {
    try {
      setSyncInProgress(true);
      setError(null);
      
      const response = await api.post('/claude-workers/workspace-sync/trigger', syncOptions);
      setLastSyncResult(response.data.result);
      
      // Refresh status after sync
      await fetchStatus();
      
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to trigger sync');
    } finally {
      setSyncInProgress(false);
    }
  };

  const updateConfig = async () => {
    try {
      await api.put('/claude-workers/workspace-sync/config', {
        conflictStrategy: syncOptions.conflictStrategy
      });
      await fetchStatus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update config');
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  if (loading && !status) {
    return (
      <div className={styles['workspace-sync-panel']}>
        <div className={styles['panel-header']}>
          <h3>🔄 Workspace Sync</h3>
        </div>
        <div className={styles['panel-content']}>
          <div className={styles.loading}>Loading...</div>
        </div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className={styles['workspace-sync-panel']}>
        <div className={styles['panel-header']}>
          <h3>🔄 Workspace Sync</h3>
        </div>
        <div className={styles['panel-content']}>
          <div className={styles.error}>
            <p>❌ {error}</p>
            <button onClick={fetchStatus} className={styles['retry-btn']}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'auto-merge': return '#4caf50';
      case 'stash': return '#ff9800';
      case 'abort': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  return (
    <div className={styles['workspace-sync-panel']}>
      <div className={styles['panel-header']}>
        <h3>🔄 Workspace Sync</h3>
        <div className={styles['header-actions']}>
          <button
            onClick={triggerSync}
            disabled={syncInProgress}
            className={styles['sync-btn']}
            title="Trigger workspace synchronization"
          >
            {syncInProgress ? '🔄 Syncing...' : '🔄 Sync Now'}
          </button>
          <button onClick={fetchStatus} className={styles['refresh-btn']} disabled={loading}>
            🔄
          </button>
        </div>
      </div>

      <div className={styles['panel-content']}>
        {/* Status Section */}
        <div className={styles['status-section']}>
          <h4>Sync Status</h4>
          <div className={styles['status-grid']}>
            <div className={styles['status-item']}>
              <span className={styles['label']}>Status:</span>
              <span 
                className={styles['value']}
                style={{ color: status?.syncInProgress ? '#ff9800' : '#4caf50' }}
              >
                {status?.syncInProgress ? 'In Progress' : 'Ready'}
              </span>
            </div>
            <div className={styles['status-item']}>
              <span className={styles['label']}>Last Sync:</span>
              <span className={styles['value']}>
                {status?.lastSyncTime ? formatTimestamp(status.lastSyncTime) : 'Never'}
              </span>
            </div>
            <div className={styles['status-item']}>
              <span className={styles['label']}>Strategy:</span>
              <span 
                className={styles['value']}
                style={{ color: getStatusColor(status?.conflictStrategy || '') }}
              >
                {status?.conflictStrategy || 'auto-merge'}
              </span>
            </div>
            <div className={styles['status-item']}>
              <span className={styles['label']}>Repositories:</span>
              <span className={styles['value']}>{status?.repositories?.length || 0}</span>
            </div>
            <div className={styles['status-item']}>
              <span className={styles['label']}>Workers:</span>
              <span className={styles['value']}>{status?.workers?.join(', ') || 'None'}</span>
            </div>
          </div>
        </div>

        {/* Configuration Section */}
        <div className={styles['config-section']}>
          <h4>Sync Configuration</h4>
          <div className={styles['config-form']}>
            <div className={styles['form-row']}>
              <label className={styles['form-label']}>
                <input
                  type="checkbox"
                  checked={syncOptions.dryRun}
                  onChange={(e) => setSyncOptions({ ...syncOptions, dryRun: e.target.checked })}
                />
                Dry Run (show what would be done)
              </label>
            </div>
            
            <div className={styles['form-row']}>
              <label className={styles['form-label']}>
                <input
                  type="checkbox"
                  checked={syncOptions.verbose}
                  onChange={(e) => setSyncOptions({ ...syncOptions, verbose: e.target.checked })}
                />
                Verbose Output
              </label>
            </div>
            
            <div className={styles['form-row']}>
              <label className={styles['form-label']}>Conflict Strategy:</label>
              <select
                value={syncOptions.conflictStrategy}
                onChange={(e) => setSyncOptions({ 
                  ...syncOptions, 
                  conflictStrategy: e.target.value as 'auto-merge' | 'stash' | 'abort' 
                })}
                className={styles['form-select']}
              >
                <option value="auto-merge">Auto-merge (prefer staging)</option>
                <option value="stash">Stash worker changes</option>
                <option value="abort">Abort on conflicts</option>
              </select>
            </div>
            
            <div className={styles['form-actions']}>
              <button
                onClick={updateConfig}
                className={styles['update-config-btn']}
              >
                Update Config
              </button>
            </div>
          </div>
        </div>

        {/* Last Sync Results */}
        {lastSyncResult && (
          <div className={styles['results-section']}>
            <h4>Last Sync Results</h4>
            <div className={styles['results-grid']}>
              <div className={styles['result-card']}>
                <div className={styles['result-value']} style={{ color: '#4caf50' }}>
                  {lastSyncResult.successful.length}
                </div>
                <div className={styles['result-label']}>Successful</div>
              </div>
              <div className={styles['result-card']}>
                <div className={styles['result-value']} style={{ color: '#ff9800' }}>
                  {lastSyncResult.conflicts.length}
                </div>
                <div className={styles['result-label']}>Conflicts</div>
              </div>
              <div className={styles['result-card']}>
                <div className={styles['result-value']} style={{ color: '#f44336' }}>
                  {lastSyncResult.errors.length}
                </div>
                <div className={styles['result-label']}>Errors</div>
              </div>
              <div className={styles['result-card']}>
                <div className={styles['result-value']} style={{ color: '#9e9e9e' }}>
                  {lastSyncResult.skipped.length}
                </div>
                <div className={styles['result-label']}>Skipped</div>
              </div>
            </div>

            {/* Detailed Results */}
            {lastSyncResult.conflicts.length > 0 && (
              <div className={styles['conflicts-detail']}>
                <h5>Conflicts:</h5>
                {lastSyncResult.conflicts.map((conflict, index) => (
                  <div key={index} className={styles['conflict-item']}>
                    <span className={styles['conflict-path']}>
                      {conflict.worker}/{conflict.repo}
                    </span>
                    <span className={styles['conflict-status']}>
                      {conflict.status || 'unresolved'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {lastSyncResult.errors.length > 0 && (
              <div className={styles['errors-detail']}>
                <h5>Errors:</h5>
                {lastSyncResult.errors.map((error, index) => (
                  <div key={index} className={styles['error-item']}>
                    <span className={styles['error-path']}>
                      {error.worker || 'main'}/{error.repo}
                    </span>
                    <span className={styles['error-message']}>
                      {error.error}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Repository and Worker Info */}
        <div className={styles['info-section']}>
          <h4>Repository & Worker Information</h4>
          <div className={styles['info-grid']}>
            <div className={styles['info-card']}>
              <h5>Repositories</h5>
              <ul className={styles['info-list']}>
                {status?.repositories?.map((repo, index) => (
                  <li key={index}>{repo}</li>
                ))}
              </ul>
            </div>
            <div className={styles['info-card']}>
              <h5>Workers</h5>
              <ul className={styles['info-list']}>
                {status?.workers?.map((worker, index) => (
                  <li key={index}>{worker}</li>
                ))}
              </ul>
            </div>
            <div className={styles['info-card']}>
              <h5>Base Directory</h5>
              <p className={styles['info-text']}>{status?.baseDir}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


