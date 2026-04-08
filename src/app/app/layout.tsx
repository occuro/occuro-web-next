'use client';

import { Sidebar } from '@/components/sidebar';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login');
    }
  }, [loading, user, router]);

  // Always render the layout — don't block on loading
  return (
    <div className="flex min-h-screen">
      <Sidebar variant="user" />
      <main className="flex-1 p-8 overflow-y-auto">{children}</main>
    </div>
  );
}
