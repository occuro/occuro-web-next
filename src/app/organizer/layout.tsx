'use client';

import { Sidebar } from '@/components/sidebar';
import { useAuthGate } from '@/lib/use-auth-gate';

export default function OrganizerLayout({ children }: { children: React.ReactNode }) {
  useAuthGate({ nurVeranstalter: true });

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar variant="organizer" />
      <main className="flex-1 px-4 py-5 lg:p-8 overflow-y-auto pb-safe">
        {children}
      </main>
    </div>
  );
}
