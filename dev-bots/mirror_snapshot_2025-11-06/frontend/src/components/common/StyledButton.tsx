import React from "react";
import { theme } from "../../styles/theme";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "error"
  | "info";
export type ButtonSize = "sm" | "md" | "lg";

interface StyledButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
}

const getVariantStyles = (variant: ButtonVariant) => {
  const styles = {
    primary: {
      backgroundColor: theme.colors.primary,
      color: theme.colors.white,
      border: `1px solid ${theme.colors.primary}`,
    },
    secondary: {
      backgroundColor: theme.colors.white,
      color: theme.colors.textPrimary,
      border: `1px solid ${theme.colors.gray300}`,
    },
    success: {
      backgroundColor: theme.colors.success,
      color: theme.colors.white,
      border: `1px solid ${theme.colors.success}`,
    },
    warning: {
      backgroundColor: theme.colors.warning,
      color: theme.colors.black,
      border: `1px solid ${theme.colors.warning}`,
    },
    error: {
      backgroundColor: theme.colors.error,
      color: theme.colors.white,
      border: `1px solid ${theme.colors.error}`,
    },
    info: {
      backgroundColor: theme.colors.info,
      color: theme.colors.white,
      border: `1px solid ${theme.colors.info}`,
    },
  };

  return styles[variant];
};

const getSizeStyles = (size: ButtonSize) => {
  const styles = {
    sm: {
      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
      fontSize: theme.typography.fontSize.sm,
      borderRadius: theme.borderRadius.sm,
    },
    md: {
      padding: `${theme.spacing.md} ${theme.spacing.lg}`,
      fontSize: theme.typography.fontSize.md,
      borderRadius: theme.borderRadius.md,
    },
    lg: {
      padding: `${theme.spacing.lg} ${theme.spacing.xl}`,
      fontSize: theme.typography.fontSize.lg,
      borderRadius: theme.borderRadius.md,
    },
  };

  return styles[size];
};

export const StyledButton: React.FC<StyledButtonProps> = ({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  disabled,
  children,
  style,
  ...props
}) => {
  const baseStyles: React.CSSProperties = {
    fontFamily: theme.typography.fontFamily,
    fontWeight: theme.typography.fontWeight.medium,
    cursor: disabled || loading ? "not-allowed" : "pointer",
    transition: theme.transitions.fast,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    textDecoration: "none",
    outline: "none",
    ...getVariantStyles(variant),
    ...getSizeStyles(size),
    ...(fullWidth && { width: "100%" }),
    ...(disabled && {
      opacity: 0.6,
      cursor: "not-allowed",
    }),
    ...style,
  };

  const hoverStyles: React.CSSProperties = {
    transform: "translateY(-1px)",
    boxShadow: theme.shadows.md,
  };

  return (
    <button
      style={baseStyles}
      disabled={disabled || loading}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          Object.assign(e.currentTarget.style, hoverStyles);
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !loading) {
          Object.assign(e.currentTarget.style, {
            transform: "translateY(0)",
            boxShadow: "none",
          });
        }
      }}
      {...props}
    >
      {loading && (
        <span
          style={{
            width: "12px",
            height: "12px",
            border: "2px solid transparent",
            borderTop: "2px solid currentColor",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
      )}
      {children}
    </button>
  );
};
