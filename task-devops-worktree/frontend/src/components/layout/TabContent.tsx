import { ReactNode } from 'react';

interface TabContentProps {
  children: ReactNode;
}

export function TabContent({ children }: TabContentProps) {
  return (
    <section className="flex-1 overflow-hidden rounded-2xl border border-border/60 bg-card/60 shadow-xl backdrop-blur">
      <div className="flex h-full flex-col gap-6 p-6">{children}</div>
    </section>
  );
}
