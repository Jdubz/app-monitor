import React from 'react';
import { theme } from '../../styles/theme';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';
export type BadgeSize = 'sm' | 'md' | 'lg';

interface StyledBadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const getVariantStyles = (variant: BadgeVariant) => {
  const styles = {
    success: {
      backgroundColor: theme.colors.success,
      color: theme.colors.white,
    },
    warning: {
      backgroundColor: theme.colors.warning,
      color: theme.colors.black,
    },
    error: {
      backgroundColor: theme.colors.error,
      color: theme.colors.white,
    },
    info: {
      backgroundColor: theme.colors.info,
      color: theme.colors.white,
    },
    neutral: {
      backgroundColor: theme.colors.gray500,
      color: theme.colors.white,
    },
  };
  
  return styles[variant];
};

const getSizeStyles = (size: BadgeSize) => {
  const styles = {
    sm: {
      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
      fontSize: theme.typography.fontSize.xs,
      borderRadius: theme.borderRadius.sm,
    },
    md: {
      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
      fontSize: theme.typography.fontSize.sm,
      borderRadius: theme.borderRadius.sm,
    },
    lg: {
      padding: `${theme.spacing.md} ${theme.spacing.lg}`,
      fontSize: theme.typography.fontSize.md,
      borderRadius: theme.borderRadius.md,
    },
  };
  
  return styles[size];
};

export const StyledBadge: React.FC<StyledBadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  children,
  style,
}) => {
  const baseStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: theme.typography.fontWeight.semibold,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    ...getVariantStyles(variant),
    ...getSizeStyles(size),
    ...style,
  };

  return (
    <span style={baseStyles}>
      {children}
    </span>
  );
};
