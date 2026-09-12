'use client';

import { Sidebar } from '@/components/sidebar';
import { useAuthGate } from '@/lib/use-auth-gate';

export default function UserLayout({ children }: { children: React.ReactNode }) {
  useAuthGate();

  // On mobile (<lg) the sidebar renders a sticky top bar via internal
  // responsive logic. On desktop it's a 260px sticky sidebar in a flex
  // row. Padding is generous on desktop, tighter on mobile, with a
  // safe-area-aware bottom padding so floating bars don't sit under
  // the iPhone home indicator.
  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar variant="user" />
      <main className="flex-1 px-4 py-5 lg:p-8 overflow-y-auto pb-safe">
        {children}
      </main>
    </div>
  );
}
