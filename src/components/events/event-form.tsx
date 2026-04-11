'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { ImageUpload } from '@/components/image-upload';
import { LocationAutocomplete } from '@/components/location-autocomplete';
import {
  Save, Loader2, AlertTriangle, Check, Trash2, Calendar, Clock,
} from 'lucide-react';
import type { Event } from '@/types/occuro';

const CATEGORIES = [
  'Music', 'Business', 'Health', 'Sports', 'Education',
  'Art', 'Food', 'Technology', 'Community', 'Outdoor',
];

const EVENT_TYPES = [
  'Festival', 'Konzert', 'Workshop', 'Meetup', 'Party',
  'Konferenz', 'Messe', 'Ausstellung', 'Sport', 'Kurs',
];

interface EventFormProps {
  /**
   * If provided, the form is in EDIT mode and pre-fills with this event.
   * If undefined, it's in CREATE mode and inserts a new row.
   */
  initialEvent?: Event;
  /**
   * "individual" → user creating a private event from /app/events/create.
   *   visibility is locked to "private", organizer_profile_id = user.id.
   * "organizer" → org creating a public/private event from /organizer/...
   *   visibility selectable, organizer_org_id set if user has an org.
   */
  mode: 'individual' | 'organizer';
  /** Where to redirect after successful save. */
  redirectAfterSave?: string;
  /** Shown if the user has the right to delete (only edit mode). */
  onDelete?: () => Promise<void> | void;
}

export function EventForm({
  initialEvent, mode, redirectAfterSave, onDelete,
}: EventFormProps) {
  const { user, organization } = useAuth();
  const supabase = createClient();
  const router = useRouter();

  const isEdit = Boolean(initialEvent);
  const isIndividual = mode === 'individual';

  const [form, setForm] = useState({
    title: initialEvent?.title ?? '',
    slogan: initialEvent?.slogan ?? '',
    description: initialEvent?.description ?? '',
    date: initialEvent?.date ?? '',
    end_date: initialEvent?.end_date ?? '',
    time: initialEvent?.time ?? '',
    end_time: initialEvent?.end_time ?? '',
    location: initialEvent?.location ?? '',
    latitude: initialEvent?.latitude ?? null as number | null,
    longitude: initialEvent?.longitude ?? null as number | null,
    category: initialEvent?.category ?? 'Music',
    subcategory: initialEvent?.subcategory ?? '',
    event_type: initialEvent?.event_type ?? 'Konzert',
    max_participants: initialEvent?.max_participants ?? (isIndividual ? 20 : 100),
    visibility: (isIndividual ? 'private' : (initialEvent?.visibility ?? 'public')) as 'public' | 'private',
    website: initialEvent?.website ?? '',
    ticket_shop_url: initialEvent?.ticket_shop_url ?? '',
    requires_ticket: initialEvent?.requires_ticket ?? false,
    chat_enabled: initialEvent?.chat_enabled ?? true,
    banner_url: initialEvent?.banner_url ?? '',
  });

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!user) {
      setError('Du musst angemeldet sein.');
      return;
    }
    if (!form.title.trim() || !form.date || !form.time || !form.location.trim()) {
      setError('Bitte fülle alle Pflichtfelder aus.');
      return;
    }

    setSaving(true);

    // Build the payload for both create and update.
    // Organizers always create public events with no participant cap —
    // their capacity is enforced via ticketing systems, not the app.
    const payload = {
      title: form.title.trim(),
      slogan: form.slogan.trim() || null,
      description: form.description.trim() || null,
      date: form.date,
      end_date: form.end_date || null,
      time: form.time,
      end_time: form.end_time || null,
      location: form.location.trim(),
      latitude: form.latitude,
      longitude: form.longitude,
      category: form.category,
      subcategory: form.subcategory.trim() || null,
      event_type: form.event_type,
      max_participants: isIndividual ? (Number(form.max_participants) || 0) : 0,
      visibility: isIndividual ? 'private' : 'public',
      website: form.website.trim() || null,
      ticket_shop_url: form.ticket_shop_url.trim() || null,
      requires_ticket: form.requires_ticket,
      chat_enabled: form.chat_enabled,
      banner_url: form.banner_url.trim() || null,
    };

    let saveError: { message: string } | null = null;
    let savedId: string | null = null;

    if (isEdit && initialEvent) {
      // Update existing event
      const { error: updErr } = await supabase
        .from('events')
        .update(payload)
        .eq('id', initialEvent.id);
      saveError = updErr;
      savedId = initialEvent.id;
    } else {
      // Insert new event with proper organizer fields based on mode
      const insertPayload = {
        ...payload,
        organizer_profile_id: user.id,
        // Individuals never have an org id; organizers attach theirs
        organizer_org_id: !isIndividual && organization?.id ? organization.id : null,
        organizer_name: !isIndividual && organization?.name ? organization.name : null,
      };
      const { data, error: insErr } = await supabase
        .from('events')
        .insert(insertPayload)
        .select('id')
        .single();
      saveError = insErr;
      savedId = (data as { id: string } | null)?.id ?? null;
    }

    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setSuccess(true);
    // Redirect after a brief success indication
    setTimeout(() => {
      if (redirectAfterSave) {
        router.push(redirectAfterSave);
      } else if (savedId) {
        router.push(`/app/event/${savedId}`);
      }
    }, 700);
  }

  async function handleDelete() {
    if (!onDelete || !initialEvent) return;
    if (!confirm(`Event "${initialEvent.title}" wirklich löschen? Diese Aktion ist endgültig.`)) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Title + slogan */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Titel" required>
          <input
            type="text"
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            required
            placeholder="Name deines Events"
            className="input"
          />
        </Field>
        <Field label="Slogan">
          <input
            type="text"
            value={form.slogan}
            onChange={(e) => update('slogan', e.target.value)}
            placeholder="Kurzer Untertitel"
            className="input"
          />
        </Field>
      </div>

      {/* Description (optional) */}
      <Field label="Beschreibung" hint="Optional — was sollen Teilnehmer wissen?">
        <textarea
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          rows={4}
          placeholder="Worum geht es bei deinem Event?"
          className="input resize-none"
        />
      </Field>

      {/* Date + time — wrapped in a labelled group for visual hierarchy */}
      <div className="rounded-2xl border border-border-subtle bg-elevated/30 p-4 space-y-4">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground/80">
          <Calendar size={13} className="text-violet-400" /> Start
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum" required>
            <div className="datetime-wrap">
              <Calendar size={14} className="datetime-icon" />
              <input
                type="date"
                value={form.date}
                onChange={(e) => update('date', e.target.value)}
                required
                className="input pl-9"
              />
            </div>
          </Field>
          <Field label="Uhrzeit" required>
            <div className="datetime-wrap">
              <Clock size={14} className="datetime-icon" />
              <input
                type="time"
                value={form.time}
                onChange={(e) => update('time', e.target.value)}
                required
                className="input pl-9"
              />
            </div>
          </Field>
        </div>

        <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground/80 pt-1">
          <Calendar size={13} className="text-muted-fg" /> Ende <span className="text-muted-fg font-normal">(optional)</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum">
            <div className="datetime-wrap">
              <Calendar size={14} className="datetime-icon" />
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => update('end_date', e.target.value)}
                className="input pl-9"
              />
            </div>
          </Field>
          <Field label="Uhrzeit">
            <div className="datetime-wrap">
              <Clock size={14} className="datetime-icon" />
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => update('end_time', e.target.value)}
                className="input pl-9"
              />
            </div>
          </Field>
        </div>
      </div>

      {/* Location — autocomplete-backed */}
      <Field label="Ort" required hint="Tippe einen Ort und wähle einen Vorschlag, damit das Event auf der Karte erscheint.">
        <LocationAutocomplete
          value={form.location}
          onChange={({ label, lat, lng }) => {
            setForm((prev) => ({ ...prev, location: label, latitude: lat, longitude: lng }));
          }}
          placeholder="z.B. Berghain, Berlin"
          required
        />
      </Field>

      {/* Category + type */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Kategorie">
          <select
            value={form.category}
            onChange={(e) => update('category', e.target.value)}
            className="input"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Unterkategorie">
          <input
            type="text"
            value={form.subcategory}
            onChange={(e) => update('subcategory', e.target.value)}
            placeholder="z.B. Techno"
            className="input"
          />
        </Field>
        <Field label="Event-Typ">
          <select
            value={form.event_type}
            onChange={(e) => update('event_type', e.target.value)}
            className="input"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>
      </div>

      {/* Banner image upload */}
      <Field label="Banner-Bild" hint="JPG, PNG oder WEBP, max. 5 MB. Empfohlenes Seitenverhältnis 21:9.">
        <ImageUpload
          value={form.banner_url}
          onChange={(url) => update('banner_url', url ?? '')}
          bucket="event-images"
          pathPrefix="event-banners"
          variant="banner"
        />
      </Field>

      {/* Participants + chat — organizers don't get a participant cap or
          a visibility toggle (they always create public events). */}
      <div className={`grid grid-cols-1 ${isIndividual ? 'md:grid-cols-2' : ''} gap-4`}>
        {isIndividual && (
          <Field label="Max. Teilnehmer">
            <input
              type="number"
              value={form.max_participants}
              onChange={(e) => update('max_participants', parseInt(e.target.value, 10) || 0)}
              className="input"
            />
          </Field>
        )}

        <Field label="Chat">
          <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border-subtle bg-elevated cursor-pointer">
            <input
              type="checkbox"
              checked={form.chat_enabled}
              onChange={(e) => update('chat_enabled', e.target.checked)}
              className="w-4 h-4 accent-violet-500"
            />
            <span className="text-sm">Event-Chat aktivieren</span>
          </label>
        </Field>
      </div>

      {/* Links — only for organizers (private events don't have a public website / ticket shop) */}
      {!isIndividual && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Website">
            <input
              type="url"
              value={form.website}
              onChange={(e) => update('website', e.target.value)}
              placeholder="https://..."
              className="input"
            />
          </Field>
          <Field label="Ticket-Shop URL">
            <input
              type="url"
              value={form.ticket_shop_url}
              onChange={(e) => update('ticket_shop_url', e.target.value)}
              placeholder="https://..."
              className="input"
            />
          </Field>
        </div>
      )}

      {/* Status messages */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[12px] text-red-400">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-[12px] text-green-400">
          <Check size={13} className="mt-0.5 flex-shrink-0" />
          <span>{isEdit ? 'Event aktualisiert.' : 'Event erstellt!'} Du wirst weitergeleitet…</span>
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <button
          type="submit"
          disabled={saving || deleting}
          className="flex-1 px-5 py-3 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {isEdit ? 'Änderungen speichern' : 'Event erstellen'}
        </button>
        {onDelete && isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving || deleting}
            className="px-5 py-3 rounded-xl text-sm font-semibold border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Event löschen
          </button>
        )}
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          padding: 0.7rem 0.875rem;
          border-radius: 0.75rem;
          border: 1px solid var(--color-border-subtle);
          background: var(--color-elevated);
          color: var(--color-foreground);
          font-size: 0.875rem;
          transition: border-color 0.15s, background-color 0.15s;
        }
        .input:focus {
          outline: none;
          border-color: rgba(139, 92, 246, 0.5);
        }
        .input::placeholder {
          color: var(--color-muted-fg);
          opacity: 0.6;
        }

        /* Date/time picker — strip the ugly native chrome and style
           with our own icon overlay. The native picker still appears
           when the user clicks anywhere on the field (so mobile keeps
           the system-level wheel pickers). */
        .datetime-wrap {
          position: relative;
          display: block;
        }
        .datetime-wrap :global(.datetime-icon) {
          position: absolute;
          left: 0.7rem;
          top: 50%;
          transform: translateY(-50%);
          color: var(--color-muted-fg);
          pointer-events: none;
          z-index: 1;
        }
        .datetime-wrap input[type='date'],
        .datetime-wrap input[type='time'] {
          appearance: none;
          -webkit-appearance: none;
          font-family: inherit;
          color-scheme: dark;
          cursor: pointer;
          min-height: 42px;
        }
        /* Hide the default calendar/clock icon since we render our own */
        .datetime-wrap input[type='date']::-webkit-calendar-picker-indicator,
        .datetime-wrap input[type='time']::-webkit-calendar-picker-indicator {
          opacity: 0;
          position: absolute;
          right: 0;
          top: 0;
          width: 100%;
          height: 100%;
          cursor: pointer;
        }
      `}</style>
    </form>
  );
}

function Field({
  label, required, hint, children,
}: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-semibold text-foreground/80">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-muted-fg">{hint}</p>}
    </div>
  );
}
