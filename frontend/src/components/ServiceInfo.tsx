import React from 'react';
import { ProcessInfo } from '../types/service.types';
import PortBadge from './PortBadge';

interface PortInfo {
  port: number;
  pid: number | null;
  inUse: boolean;
}

interface ServiceInfoProps {
  service: ProcessInfo;
  portStatuses?: PortInfo[];
  onKillPort?: (port: number) => Promise<void>;
}

const ServiceInfo: React.FC<ServiceInfoProps> = ({ service, portStatuses, onKillPort }) => {
  const formatUptime = (ms: number | undefined) => {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const renderPorts = () => {
    if (!service.ports || service.ports.length === 0) return <span style={valueStyle}>N/A</span>;

    // If we have port status information, render PortBadge components
    if (portStatuses && portStatuses.length > 0 && onKillPort) {
      return (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {portStatuses.map((portInfo) => (
            <PortBadge
              key={portInfo.port}
              portInfo={portInfo}
              onKillPort={onKillPort}
            />
          ))}
        </div>
      );
    }

    // Fallback to plain text if no port status information available
    return <span style={valueStyle}>{service.ports.join(', ')}</span>;
  };

  const infoItemStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: '13px',
    borderBottom: '1px solid #f0f0f0',
  };

  const labelStyle = {
    fontWeight: 500,
    color: '#666',
  };

  const valueStyle = {
    color: '#333',
    fontFamily: 'monospace',
  };

  return (
    <div style={{ marginTop: '12px' }}>
      <div style={infoItemStyle}>
        <span style={labelStyle}>Status:</span>
        <span style={valueStyle}>{service.status}</span>
      </div>

      {service.status === 'running' && (
        <>
          <div style={infoItemStyle}>
            <span style={labelStyle}>PID:</span>
            <span style={valueStyle}>{service.pid || 'N/A'}</span>
          </div>

          <div style={infoItemStyle}>
            <span style={labelStyle}>Uptime:</span>
            <span style={valueStyle}>{formatUptime(service.uptime)}</span>
          </div>
        </>
      )}

      <div style={infoItemStyle}>
        <span style={labelStyle}>Port(s):</span>
        {renderPorts()}
      </div>

      {service.error && (
        <div style={{
          marginTop: '8px',
          padding: '8px',
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#c00',
        }}>
          <strong>Error:</strong> {service.error}
        </div>
      )}
    </div>
  );
};

export default ServiceInfo;
