import React from 'react';
import { ProcessInfo } from '../types/service.types';
import { StyledBadge, BadgeVariant } from './common/StyledBadge';
import { theme } from '../styles/theme';

interface StatusBadgeProps {
  status: ProcessInfo['status'];
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getStatusConfig = (): { variant: BadgeVariant; text: string; isTransitional: boolean } => {
    switch (status) {
      case 'running':
        return { variant: 'success', text: '● Running', isTransitional: false };
      case 'stopped':
        return { variant: 'error', text: '○ Stopped', isTransitional: false };
      case 'starting':
        return { variant: 'warning', text: '◐ Starting...', isTransitional: true };
      case 'stopping':
        return { variant: 'warning', text: '◑ Stopping...', isTransitional: true };
      case 'error':
        return { variant: 'error', text: '✕ Error', isTransitional: false };
      default:
        return { variant: 'neutral', text: status, isTransitional: false };
    }
  };

  const { variant, text, isTransitional } = getStatusConfig();

  return (
    <StyledBadge
      variant={variant}
      size="md"
      style={{
        animation: isTransitional ? 'pulse 1.5s ease-in-out infinite' : 'none',
        fontFamily: theme.typography.fontFamily,
        fontWeight: theme.typography.fontWeight.semibold,
      }}
    >
      {text}
    </StyledBadge>
  );
};

export default StatusBadge;