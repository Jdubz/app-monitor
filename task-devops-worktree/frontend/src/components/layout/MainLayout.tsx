import { ReactNode } from 'react';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex min-h-screen w-full max-w-[1660px] flex-col gap-6 px-6 pb-12 pt-8 sm:px-8 lg:px-12">
        {children}
      </main>
    </div>
  );
}
