'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [userType, setUserType] = useState<'individual' | 'organization'>('individual');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          user_type: userType,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <h2 className="text-2xl font-heading font-bold">Bestätige deine E-Mail</h2>
          <p className="text-muted-fg">
            Wir haben dir eine E-Mail an <strong>{email}</strong> geschickt.
            Klicke auf den Link, um dein Konto zu aktivieren.
          </p>
          <Link href="/auth/login" className="inline-block mt-4 text-sm font-medium hover:underline">
            Zurück zum Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="text-3xl font-heading font-bold">occuro</Link>
          <p className="mt-3 text-muted-fg">Erstelle dein Konto</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-sm text-center">
              {error}
            </div>
          )}

          {/* User Type Toggle */}
          <div className="flex rounded-xl bg-muted p-1">
            <button
              type="button"
              onClick={() => setUserType('individual')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${
                userType === 'individual'
                  ? 'bg-input-bg text-foreground shadow-sm'
                  : 'text-muted-fg'
              }`}
            >
              Besucher
            </button>
            <button
              type="button"
              onClick={() => setUserType('organization')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${
                userType === 'organization'
                  ? 'bg-input-bg text-foreground shadow-sm'
                  : 'text-muted-fg'
              }`}
            >
              Veranstalter
            </button>
          </div>

          <div>
            <label htmlFor="fullName" className="block text-sm font-medium mb-1.5">
              {userType === 'organization' ? 'Organisationsname' : 'Vollständiger Name'}
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-border-subtle bg-input-bg text-foreground placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-primary-bg/20 focus:border-primary-bg transition"
              placeholder={userType === 'organization' ? 'z.B. Club Berlin' : 'Max Mustermann'}
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1.5">
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-border-subtle bg-input-bg text-foreground placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-primary-bg/20 focus:border-primary-bg transition"
              placeholder="deine@email.de"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5">
              Passwort
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-xl border border-border-subtle bg-input-bg text-foreground placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-primary-bg/20 focus:border-primary-bg transition"
              placeholder="Mindestens 6 Zeichen"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl text-base font-semibold bg-primary-bg text-primary-text hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? 'Registrieren...' : 'Registrieren'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-fg">
          Bereits ein Konto?{' '}
          <Link href="/auth/login" className="font-medium text-foreground hover:underline">
            Anmelden
          </Link>
        </p>
      </div>
    </div>
  );
}
