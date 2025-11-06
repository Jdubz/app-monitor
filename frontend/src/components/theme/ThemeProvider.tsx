import { ReactNode, useEffect } from 'react';

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');
    root.classList.add('bg-background');
    return () => {
      root.classList.remove('dark');
    };
  }, []);

  return children;
}
