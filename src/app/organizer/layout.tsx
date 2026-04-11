'use client';

import { Sidebar } from '@/components/sidebar';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const { user, userType, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace('/auth/login');
      else if (userType && userType !== 'organization') router.replace('/app');
    }
  }, [loading, user, userType, router]);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar variant="organizer" />
      <main className="flex-1 px-4 py-5 lg:p-8 overflow-y-auto pb-safe">
        {children}
      </main>
    </div>
  );
}
