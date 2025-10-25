import React from 'react';
import { theme } from '../../styles/theme';

export type CardVariant = 'default' | 'elevated' | 'outlined';
export type CardPadding = 'sm' | 'md' | 'lg';

interface StyledCardProps {
  variant?: CardVariant;
  padding?: CardPadding;
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
  hoverable?: boolean;
}

const getVariantStyles = (variant: CardVariant) => {
  const styles = {
    default: {
      backgroundColor: theme.colors.surface,
      border: 'none',
      boxShadow: theme.shadows.sm,
    },
    elevated: {
      backgroundColor: theme.colors.surface,
      border: 'none',
      boxShadow: theme.shadows.lg,
    },
    outlined: {
      backgroundColor: theme.colors.surface,
      border: `1px solid ${theme.colors.gray300}`,
      boxShadow: 'none',
    },
  };
  
  return styles[variant];
};

const getPaddingStyles = (padding: CardPadding) => {
  const styles = {
    sm: theme.spacing.md,
    md: theme.spacing.lg,
    lg: theme.spacing.xl,
  };
  
  return { padding: styles[padding] };
};

export const StyledCard: React.FC<StyledCardProps> = ({
  variant = 'default',
  padding = 'md',
  children,
  style,
  onClick,
  hoverable = false,
}) => {
  const baseStyles: React.CSSProperties = {
    borderRadius: theme.borderRadius.md,
    transition: theme.transitions.fast,
    cursor: onClick ? 'pointer' : 'default',
    ...getVariantStyles(variant),
    ...getPaddingStyles(padding),
    ...style,
  };

  const hoverStyles: React.CSSProperties = hoverable ? {
    transform: 'translateY(-2px)',
    boxShadow: theme.shadows.xl,
  } : {};

  return (
    <div
      style={baseStyles}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (hoverable) {
          Object.assign(e.currentTarget.style, hoverStyles);
        }
      }}
      onMouseLeave={(e) => {
        if (hoverable) {
          Object.assign(e.currentTarget.style, {
            transform: 'translateY(0)',
            boxShadow: getVariantStyles(variant).boxShadow,
          });
        }
      }}
    >
      {children}
    </div>
  );
};
