import React, { useState } from 'react';
import { ProcessInfo } from '../types/service.types';
import StatusBadge from './StatusBadge';
import ControlButtons from './ControlButtons';
import ServiceInfo from './ServiceInfo';
import { StyledCard, StyledButton } from './common';
import { theme } from '../styles/theme';

interface PortInfo {
  port: number;
  pid: number | null;
  inUse: boolean;
}

interface ServiceCardProps {
  service: ProcessInfo;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onRestart: () => Promise<void>;
  onKill: () => Promise<void>;
  portStatuses?: PortInfo[];
  onKillPort?: (port: number) => Promise<void>;
}

const ServiceCard: React.FC<ServiceCardProps> = ({
  service,
  onStart,
  onStop,
  onRestart,
  onKill,
  portStatuses,
  onKillPort,
}) => {
  const [isControlling, setIsControlling] = useState(false);

  // Docker container control functions
  const handleDockerAction = async (action: string) => {
    try {
      setIsControlling(true);
      const response = await fetch(
        `http://localhost:5000/api/services/${service.name}/docker/${action}`,
        { method: 'POST' }
      );

      if (!response.ok) {
        let errorMessage = 'Docker action failed';
        try {
          const error = await response.json();
          errorMessage = error.error || error.message || errorMessage;
        } catch (jsonError) {
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      try {
        await response.json();
      } catch {
        // Response might be empty, that's ok for some actions
      }

      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error(`Docker action ${action} failed:`, error);
      alert(`Failed to ${action}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsControlling(false);
    }
  };

  // const _formatUptime = (startedAt: number | null) => {
  //   if (!startedAt) return 'Unknown';
  //   const uptime = Date.now() - startedAt;
  //   const seconds = Math.floor(uptime / 1000);
  //   const minutes = Math.floor(seconds / 60);
  //   const hours = Math.floor(minutes / 60);

  //   if (hours > 0) {
  //     return `${hours}h ${minutes % 60}m`;
  //   } else if (minutes > 0) {
  //     return `${minutes}m ${seconds % 60}s`;
  //   } else {
  //     return `${seconds}s`;
  //   }
  // };

  const getStatusBadgeStyle = (status: string): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: theme.typography.fontSize.sm,
      fontWeight: theme.typography.fontWeight.semibold,
      color: theme.colors.white,
    };

    const colors: Record<string, string> = {
      running: theme.colors.success,
      idle: theme.colors.warning,
      stopped: theme.colors.gray500,
      exited: theme.colors.error,
      unknown: theme.colors.info,
    };

    return {
      ...baseStyle,
      backgroundColor: colors[status] || colors.unknown,
    };
  };

  return (
    <StyledCard
      variant="default"
      padding="md"
      hoverable
      style={{
        marginBottom: theme.spacing.lg,
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.md,
      }}>
        <h3 style={{
          fontSize: theme.typography.fontSize.xxl,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.textPrimary,
          margin: 0,
        }}>
          {service.displayName}
        </h3>
        <StatusBadge status={service.status} />
      </div>

      {/* Docker Container Status for job-finder-worker */}
      {service.name === 'job-finder-worker' && service.dockerContainer && (
        <div style={{
          marginTop: theme.spacing.md,
          marginBottom: theme.spacing.md,
          padding: theme.spacing.md,
          backgroundColor: theme.colors.gray50,
          borderRadius: theme.borderRadius.sm,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.sm,
            marginBottom: theme.spacing.sm,
          }}>
            <span style={{
              fontWeight: theme.typography.fontWeight.medium,
              minWidth: '80px',
            }}>
              Container:
            </span>
            <span style={getStatusBadgeStyle(service.dockerContainer.status)}>
              {service.dockerContainer.status}
            </span>
            <span style={{
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.textSecondary,
              fontFamily: 'monospace',
            }}>
              {service.dockerContainer.name}
            </span>
          </div>

          {service.dockerContainer.workerStatus && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.sm,
              marginBottom: theme.spacing.sm,
            }}>
              <span style={{
                fontWeight: theme.typography.fontWeight.medium,
                minWidth: '80px',
              }}>
                Worker:
              </span>
              <span style={getStatusBadgeStyle(service.dockerContainer.workerStatus)}>
                {service.dockerContainer.workerStatus}
              </span>
            </div>
          )}

          <div style={{
            display: 'flex',
            gap: theme.spacing.sm,
            marginTop: theme.spacing.md,
          }}>
            <StyledButton
              variant="success"
              size="sm"
              onClick={() => handleDockerAction('start-container')}
              disabled={service.dockerContainer.status === 'running' || isControlling}
            >
              Start Container
            </StyledButton>

            <StyledButton
              variant="error"
              size="sm"
              onClick={() => handleDockerAction('stop-container')}
              disabled={service.dockerContainer.status !== 'running' || isControlling}
            >
              Stop Container
            </StyledButton>

            <StyledButton
              variant="warning"
              size="sm"
              onClick={() => handleDockerAction('restart-worker')}
              disabled={service.dockerContainer.status !== 'running' || isControlling}
            >
              Restart Worker
            </StyledButton>
          </div>
        </div>
      )}

      {/* Only show regular service controls for non job-finder-worker services */}
      {service.name !== 'job-finder-worker' && (
        <ControlButtons
          service={service}
          onStart={onStart}
          onStop={onStop}
          onRestart={onRestart}
          onKill={onKill}
        />
      )}

      <ServiceInfo
        service={service}
        portStatuses={portStatuses}
        onKillPort={onKillPort}
      />
    </StyledCard>
  );
};

export default ServiceCard;
