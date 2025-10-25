/**
 * Design System Theme
 * 
 * Centralized design tokens for consistent styling across the application.
 * Replaces scattered inline styles with a cohesive design system.
 */

export const theme = {
  colors: {
    // Primary colors
    primary: '#4dabf7',
    primaryDark: '#339af0',
    primaryLight: '#74c0fc',
    
    // Status colors
    success: '#28a745',
    warning: '#ffc107',
    error: '#dc3545',
    info: '#17a2b8',
    
    // Neutral colors
    white: '#ffffff',
    gray50: '#f8f9fa',
    gray100: '#f1f3f4',
    gray200: '#e9ecef',
    gray300: '#dee2e6',
    gray400: '#ced4da',
    gray500: '#adb5bd',
    gray600: '#6c757d',
    gray700: '#495057',
    gray800: '#343a40',
    gray900: '#212529',
    black: '#000000',
    
    // Background colors
    background: '#f5f5f5',
    surface: '#ffffff',
    surfaceHover: '#f8f9fa',
    
    // Text colors
    textPrimary: '#333333',
    textSecondary: '#666666',
    textMuted: '#999999',
    textLight: '#cccccc',
  },
  
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    xxl: '24px',
    xxxl: '32px',
  },
  
  borderRadius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '50%',
  },
  
  shadows: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 2px 4px rgba(0,0,0,0.05)',
    lg: '0 4px 8px rgba(0,0,0,0.08)',
    xl: '0 8px 16px rgba(0,0,0,0.1)',
  },
  
  typography: {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: {
      xs: '11px',
      sm: '12px',
      md: '13px',
      lg: '14px',
      xl: '15px',
      xxl: '18px',
      xxxl: '20px',
      title: '28px',
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.4,
      relaxed: 1.6,
    },
  },
  
  transitions: {
    fast: '0.15s ease',
    normal: '0.2s ease',
    slow: '0.3s ease',
  },
  
  zIndex: {
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modal: 1040,
    popover: 1050,
    tooltip: 1060,
  },
} as const;

export type Theme = typeof theme;
