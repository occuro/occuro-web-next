'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'E-Mail oder Passwort falsch.'
        : error.message);
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('id', user.id)
        .single();

      // Hard redirect so cookies are properly set for SSR
      window.location.href = profile?.user_type === 'organization' ? '/organizer' : '/app';
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px] animate-fade-in">
        <div className="text-center mb-10">
          <Link href="/" className="text-2xl font-heading font-bold tracking-tight hover:opacity-70 transition-opacity">
            occuro
          </Link>
          <p className="mt-2 text-sm text-muted-fg">Willkommen zurück</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-destructive/8 text-destructive text-[13px] text-center animate-fade-in-scale">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-[13px] font-medium text-foreground/70">
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-border-subtle bg-input-bg text-foreground text-sm placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-primary-bg/10 focus:border-primary-bg/30 transition-all duration-200"
              placeholder="deine@email.de"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-[13px] font-medium text-foreground/70">
              Passwort
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-border-subtle bg-input-bg text-foreground text-sm placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-primary-bg/10 focus:border-primary-bg/30 transition-all duration-200"
              placeholder="Passwort"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 mt-2 rounded-full text-sm font-semibold bg-primary-bg text-primary-text hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 transition-transform shadow-sm"
          >
            {loading ? 'Anmelden...' : 'Anmelden'}
          </button>
        </form>

        <p className="text-center text-[13px] text-muted-fg mt-8">
          Noch kein Konto?{' '}
          <Link href="/auth/register" className="font-medium text-foreground hover:opacity-70 transition-opacity">
            Registrieren
          </Link>
        </p>
      </div>
    </div>
  );
}
