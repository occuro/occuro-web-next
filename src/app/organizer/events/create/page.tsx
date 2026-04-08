'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

const categories = [
  'Music', 'Business', 'Health', 'Sports', 'Education',
  'Art', 'Food', 'Technology', 'Community', 'Outdoor',
];

const eventTypes = [
  'Festival', 'Konzert', 'Workshop', 'Meetup', 'Party',
  'Konferenz', 'Messe', 'Ausstellung', 'Sport', 'Kurs',
];

export default function CreateEventPage() {
  const { user, organization } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    title: '',
    slogan: '',
    description: '',
    date: '',
    end_date: '',
    time: '',
    end_time: '',
    location: '',
    category: 'Music',
    subcategory: '',
    event_type: 'Konzert',
    max_participants: 100,
    visibility: 'public' as 'public' | 'private',
    website: '',
    ticket_shop_url: '',
    requires_ticket: false,
    available_tickets: 0,
    chat_enabled: true,
  });

  const updateField = (field: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: insertError } = await supabase.from('events').insert({
      ...form,
      organizer_profile_id: user!.id,
      organizer_org_id: organization?.id ?? null,
      organizer_name: organization?.name ?? null,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push('/organizer/events');
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-heading font-bold">Event erstellen</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        {/* Title & Slogan */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Titel *" required>
            <input
              type="text"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              required
              className="input-field"
              placeholder="Name deines Events"
            />
          </Field>
          <Field label="Slogan">
            <input
              type="text"
              value={form.slogan}
              onChange={(e) => updateField('slogan', e.target.value)}
              className="input-field"
              placeholder="Kurzer Untertitel"
            />
          </Field>
        </div>

        {/* Description */}
        <Field label="Beschreibung *" required>
          <textarea
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            required
            rows={4}
            className="input-field resize-none"
            placeholder="Beschreibe dein Event..."
          />
        </Field>

        {/* Date & Time */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Startdatum *" required>
            <input
              type="date"
              value={form.date}
              onChange={(e) => updateField('date', e.target.value)}
              required
              className="input-field"
            />
          </Field>
          <Field label="Startzeit *" required>
            <input
              type="time"
              value={form.time}
              onChange={(e) => updateField('time', e.target.value)}
              required
              className="input-field"
            />
          </Field>
          <Field label="Enddatum">
            <input
              type="date"
              value={form.end_date}
              onChange={(e) => updateField('end_date', e.target.value)}
              className="input-field"
            />
          </Field>
          <Field label="Endzeit">
            <input
              type="time"
              value={form.end_time}
              onChange={(e) => updateField('end_time', e.target.value)}
              className="input-field"
            />
          </Field>
        </div>

        {/* Location */}
        <Field label="Ort *" required>
          <input
            type="text"
            value={form.location}
            onChange={(e) => updateField('location', e.target.value)}
            required
            className="input-field"
            placeholder="z.B. Berghain, Berlin"
          />
        </Field>

        {/* Category & Type */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Kategorie">
            <select
              value={form.category}
              onChange={(e) => updateField('category', e.target.value)}
              className="input-field"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Unterkategorie">
            <input
              type="text"
              value={form.subcategory}
              onChange={(e) => updateField('subcategory', e.target.value)}
              className="input-field"
              placeholder="z.B. Techno"
            />
          </Field>
          <Field label="Event-Typ">
            <select
              value={form.event_type}
              onChange={(e) => updateField('event_type', e.target.value)}
              className="input-field"
            >
              {eventTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* Participants & Visibility */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Max. Teilnehmer">
            <input
              type="number"
              value={form.max_participants}
              onChange={(e) => updateField('max_participants', parseInt(e.target.value) || 0)}
              className="input-field"
            />
          </Field>
          <Field label="Sichtbarkeit">
            <select
              value={form.visibility}
              onChange={(e) => updateField('visibility', e.target.value)}
              className="input-field"
            >
              <option value="public">Öffentlich</option>
              <option value="private">Privat</option>
            </select>
          </Field>
          <Field label="Chat aktiviert">
            <div className="flex items-center h-full pt-1">
              <input
                type="checkbox"
                checked={form.chat_enabled}
                onChange={(e) => updateField('chat_enabled', e.target.checked)}
                className="w-5 h-5 rounded"
              />
              <span className="ml-2 text-sm">Event-Chat aktivieren</span>
            </div>
          </Field>
        </div>

        {/* Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Website">
            <input
              type="url"
              value={form.website}
              onChange={(e) => updateField('website', e.target.value)}
              className="input-field"
              placeholder="https://..."
            />
          </Field>
          <Field label="Ticket-Shop URL">
            <input
              type="url"
              value={form.ticket_shop_url}
              onChange={(e) => updateField('ticket_shop_url', e.target.value)}
              className="input-field"
              placeholder="https://..."
            />
          </Field>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 rounded-2xl text-base font-semibold bg-primary-bg text-primary-text hover:opacity-90 disabled:opacity-50 transition"
        >
          {loading ? 'Erstellen...' : 'Event erstellen'}
        </button>
      </form>

      <style jsx>{`
        .input-field {
          width: 100%;
          padding: 0.75rem 1rem;
          border-radius: 0.75rem;
          border: 1px solid var(--border);
          background: var(--input-bg);
          color: var(--foreground);
          font-size: 0.875rem;
          transition: all 0.15s;
        }
        .input-field:focus {
          outline: none;
          box-shadow: 0 0 0 2px rgba(26,26,26,0.1);
          border-color: var(--primary-bg);
        }
        .input-field::placeholder {
          color: var(--muted-fg);
        }
      `}</style>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}
