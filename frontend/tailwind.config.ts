import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--app-background))',
        foreground: 'hsl(var(--app-foreground))',
        border: 'hsl(var(--app-border))',
        ring: 'hsl(var(--app-ring))',
        muted: {
          DEFAULT: 'hsl(var(--app-muted))',
          foreground: 'hsl(var(--app-muted-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--app-card))',
          foreground: 'hsl(var(--app-card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--app-popover))',
          foreground: 'hsl(var(--app-popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--app-primary))',
          foreground: 'hsl(var(--app-primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--app-secondary))',
          foreground: 'hsl(var(--app-secondary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--app-accent))',
          foreground: 'hsl(var(--app-accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--app-destructive))',
          foreground: 'hsl(var(--app-destructive-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--app-radius)',
        md: 'calc(var(--app-radius) - 2px)',
        sm: 'calc(var(--app-radius) - 4px)',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(10, 226, 255, 0.1), 0 10px 30px rgba(10, 226, 255, 0.15)',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
