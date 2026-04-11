'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { ImageUpload } from '@/components/image-upload';
import { LocationAutocomplete } from '@/components/location-autocomplete';
import {
  Save, Loader2, AlertTriangle, Check, Trash2, Calendar, UserPlus, Users,
} from 'lucide-react';
import type { Event } from '@/types/occuro';

interface FriendOption {
  id: string;
  full_name: string;
  username: string | null;
  avatar_url: string | null;
}

// Canonical list copied from the mobile CreateEventModal so the values
// written to events.category match across both clients. Mismatching
// labels would split events across two effective taxonomies and break
// filtering.
const CATEGORIES = [
  'Music', 'Business', 'Health', 'Sports', 'Education',
  'Art & Culture', 'Food & Drink', 'Technology', 'Community', 'Outdoor',
];

const SUBCATEGORIES: Record<string, string[]> = {
  Music: ['Techno', 'House', 'Rock', 'Pop', 'Jazz', 'Hip Hop', 'Electronic', 'Indie'],
  Business: ['Networking', 'Workshop', 'Conference', 'Startup', 'Marketing'],
  Health: ['Yoga', 'Meditation', 'Wellness', 'Fitness', 'Mental Health'],
  Sports: ['Football', 'Tennis', 'Running', 'Basketball', 'Swimming'],
  Education: ['Seminar', 'Training', 'Course', 'Lecture', 'Masterclass'],
  'Art & Culture': ['Exhibition', 'Theater', 'Movie', 'Gallery', 'Comedy'],
  'Food & Drink': ['Wine Tasting', 'Cooking', 'Food Festival', 'Brunch'],
  Technology: ['Hackathon', 'Meetup', 'Tech Talk', 'AI & ML', 'Coding'],
  Community: ['Volunteering', 'Neighborhood', 'Social Gathering'],
  Outdoor: ['Hiking', 'Camping', 'Picnic', 'BBQ'],
};

const EVENT_TYPES = [
  'Festival', 'Concert', 'Party', 'Workshop', 'Conference',
  'Trade Show', 'Seminar', 'Networking', 'Exhibition', 'Tournament',
  'Lecture', 'Meetup', 'Retreat', 'Gala', 'Premiere', 'Other',
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
    event_type: initialEvent?.event_type ?? 'Concert',
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

  // ── Friend invitation state (individual mode only) ──────────────────
  const [friends, setFriends] = useState<FriendOption[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [friendSearch, setFriendSearch] = useState('');

  useEffect(() => {
    if (!isIndividual || !user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('friendships')
        .select('user_id, friend_id, status')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
        .eq('status', 'accepted');
      if (cancelled || !data) return;
      const ids = new Set<string>();
      data.forEach((f: { user_id: string; friend_id: string }) => {
        const other = f.user_id === user.id ? f.friend_id : f.user_id;
        if (other) ids.add(other);
      });
      if (ids.size === 0) { setFriends([]); return; }
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', Array.from(ids));
      if (cancelled) return;
      setFriends(((profs ?? []) as FriendOption[]).sort((a, b) =>
        (a.full_name ?? '').localeCompare(b.full_name ?? '', 'de', { sensitivity: 'base' }),
      ));
    })();
    return () => { cancelled = true; };
  }, [isIndividual, user, supabase]);

  function toggleFriend(id: string) {
    setSelectedFriendIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredFriends = friendSearch.trim()
    ? friends.filter((f) => {
        const q = friendSearch.trim().toLowerCase();
        return (
          (f.full_name ?? '').toLowerCase().includes(q) ||
          (f.username ?? '').toLowerCase().includes(q)
        );
      })
    : friends;

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

    // Mobile parity: an individual private event must have at least one
    // invited friend on creation. Without this rule a private event has
    // no audience and is invisible to everyone — pointless to create.
    // Edit mode is exempt: invitations are managed from the detail page
    // once the event exists.
    if (isIndividual && !isEdit && selectedFriendIds.size === 0) {
      setError('Lade mindestens eine:n Freund:in ein, sonst sieht niemand das Event.');
      return;
    }

    // Mobile parity: organizers must be verified before they can publish
    // a public event. Without this any newly registered org could
    // immediately push events to the discovery feed.
    if (!isIndividual && !organization?.verified) {
      setError('Deine Organisation ist noch nicht verifiziert. Verifiziere sie zuerst, bevor du Events erstellen kannst.');
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
      max_participants: 0, // No participant cap — invitations / ticketing handle this
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
      // Insert new event with proper organizer fields based on mode.
      // The events table has a CHECK constraint that organizer_org_id
      // and organizer_profile_id are mutually exclusive — exactly one
      // of them must be set, never both. Organizers go through the
      // org id, individuals through their profile id.
      const insertPayload = {
        ...payload,
        organizer_profile_id: !isIndividual && organization?.id ? null : user.id,
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

    if (saveError) {
      setSaving(false);
      setError(saveError.message);
      return;
    }

    // ── Send out invitations for newly created private events ────────
    // Only on CREATE (not edit) and only when in individual mode and the
    // user actually picked some friends. We insert them in one batch
    // and intentionally swallow per-row errors so the event itself
    // still counts as created — the user can still invite later from
    // the event detail page if a row fails.
    if (!isEdit && isIndividual && savedId && selectedFriendIds.size > 0) {
      const rows = Array.from(selectedFriendIds).map((friendId) => ({
        event_id: savedId!,
        invited_user_id: friendId,
        invited_by: user.id,
        status: 'pending' as const,
      }));
      const { error: invErr } = await supabase.from('event_invitations').insert(rows);
      if (invErr) {
        console.warn('[event-form] invitation insert failed:', invErr.message);
      }
    }

    setSaving(false);
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
      {/* Banner image — sits at the very top so it's the first thing
          a user sees while creating the event. The visual anchor for
          everything that follows. */}
      <Field label="Banner-Bild" hint="JPG, PNG oder WEBP, max. 5 MB. Empfohlenes Seitenverhältnis 21:9.">
        <ImageUpload
          value={form.banner_url}
          onChange={(url) => update('banner_url', url ?? '')}
          bucket="event-images"
          pathPrefix="event-banners"
          variant="banner"
        />
      </Field>

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
              <input
                type="date"
                value={form.date}
                onChange={(e) => update('date', e.target.value)}
                required
                className="input"
              />
            </div>
          </Field>
          <Field label="Uhrzeit" required>
            <div className="datetime-wrap">
              <input
                type="time"
                value={form.time}
                onChange={(e) => update('time', e.target.value)}
                required
                step={300}
                className="input"
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
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => update('end_date', e.target.value)}
                className="input"
              />
            </div>
          </Field>
          <Field label="Uhrzeit">
            <div className="datetime-wrap">
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => update('end_time', e.target.value)}
                step={300}
                className="input"
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

      {/* Friends invitation — only on create + only for individual mode.
          Edit mode hides it because invitations are managed from the
          event detail page once it exists. */}
      {isIndividual && !isEdit && (
        <div className="rounded-2xl border border-border-subtle bg-elevated/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground/80">
              <UserPlus size={13} className="text-violet-400" /> Freunde einladen
              {selectedFriendIds.size > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-600 text-white">
                  {selectedFriendIds.size}
                </span>
              )}
            </div>
            <span className="text-[11px] text-muted-fg">Optional</span>
          </div>

          {friends.length === 0 ? (
            <p className="text-[12px] text-muted-fg italic py-3 text-center">
              Du hast noch keine Freunde hinzugefügt.
            </p>
          ) : (
            <>
              {friends.length > 6 && (
                <input
                  type="text"
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                  placeholder="Freunde suchen…"
                  className="w-full px-3 py-2 rounded-xl border border-border-subtle bg-surface text-[12px] placeholder:text-muted-fg/60 focus:outline-none focus:border-violet-500/40"
                />
              )}
              <div className="max-h-60 overflow-y-auto space-y-1.5 -mx-1 px-1">
                {filteredFriends.length === 0 ? (
                  <p className="text-[12px] text-muted-fg italic py-3 text-center">
                    Keine Freunde gefunden.
                  </p>
                ) : (
                  filteredFriends.map((friend) => {
                    const checked = selectedFriendIds.has(friend.id);
                    return (
                      <button
                        key={friend.id}
                        type="button"
                        onClick={() => toggleFriend(friend.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors text-left ${
                          checked
                            ? 'bg-violet-500/10 border-violet-500/40'
                            : 'bg-surface border-border-subtle hover:bg-elevated'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
                          {friend.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={friend.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[11px] font-semibold text-foreground/70">
                              {friend.full_name?.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium truncate">{friend.full_name}</p>
                          {friend.username && (
                            <p className="text-[10px] text-muted-fg truncate">@{friend.username}</p>
                          )}
                        </div>
                        <div
                          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                            checked
                              ? 'bg-violet-600 border-violet-600 text-white'
                              : 'border-border-strong'
                          }`}
                        >
                          {checked && <Check size={12} strokeWidth={3} />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              {selectedFriendIds.size > 0 && (
                <p className="text-[11px] text-muted-fg text-center pt-1">
                  <Users size={10} className="inline mb-0.5" /> {selectedFriendIds.size}{' '}
                  {selectedFriendIds.size === 1 ? 'Freund wird' : 'Freunde werden'} nach dem
                  Erstellen eingeladen.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Category + type — subcategory is driven by the chosen category
          (mobile-parity), changing the category clears it. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Kategorie">
          <select
            value={form.category}
            onChange={(e) => {
              const next = e.target.value;
              setForm((prev) => ({ ...prev, category: next, subcategory: '' }));
            }}
            className="input"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Unterkategorie">
          {SUBCATEGORIES[form.category] ? (
            <select
              value={form.subcategory}
              onChange={(e) => update('subcategory', e.target.value)}
              className="input"
            >
              <option value="">— wählen —</option>
              {SUBCATEGORIES[form.category].map((sub) => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={form.subcategory}
              onChange={(e) => update('subcategory', e.target.value)}
              placeholder="Optional"
              className="input"
            />
          )}
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

      {/* Chat-Toggle — kein Teilnehmer-Cap mehr (weder Privat noch
          Veranstalter). Für private Events ist die Einladung der echte
          „Cap" und für Veranstalter regelt die Ticketing-Plattform das. */}
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

        /* Date/time picker — bigger touch targets, monospace numerals
           for tabular alignment, and a nicer focus state. We keep the
           native picker (best UX on mobile) but make the visible
           field feel custom-built. */
        .datetime-wrap {
          position: relative;
          display: block;
        }
        .datetime-wrap input[type='date'],
        .datetime-wrap input[type='time'] {
          font-family: 'Space Grotesk', ui-monospace, monospace;
          font-variant-numeric: tabular-nums;
          font-size: 0.95rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          color-scheme: dark;
          cursor: pointer;
          min-height: 48px;
          padding: 0.75rem 1rem;
          background: var(--color-elevated);
          border: 1px solid var(--color-border-subtle);
          border-radius: 0.875rem;
          transition: border-color 0.15s, background-color 0.15s, transform 0.1s;
        }
        .datetime-wrap input[type='date']:hover,
        .datetime-wrap input[type='time']:hover {
          background: var(--color-muted);
          border-color: var(--color-border-strong);
        }
        .datetime-wrap input[type='date']:focus,
        .datetime-wrap input[type='time']:focus {
          outline: none;
          border-color: rgba(139, 92, 246, 0.6);
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.12);
        }
        .datetime-wrap input[type='date']:active,
        .datetime-wrap input[type='time']:active {
          transform: scale(0.98);
        }
        /* Style the native indicator — small, accent-colored, and
           clickable. The indicator is the only piece of native chrome
           we can target consistently across browsers. */
        .datetime-wrap input[type='date']::-webkit-calendar-picker-indicator,
        .datetime-wrap input[type='time']::-webkit-calendar-picker-indicator {
          filter: invert(0.5) sepia(1) hue-rotate(230deg) saturate(2);
          cursor: pointer;
          opacity: 0.8;
          padding: 4px;
          margin-right: -4px;
          border-radius: 6px;
          transition: opacity 0.15s, background-color 0.15s;
        }
        .datetime-wrap input[type='date']::-webkit-calendar-picker-indicator:hover,
        .datetime-wrap input[type='time']::-webkit-calendar-picker-indicator:hover {
          opacity: 1;
          background-color: rgba(139, 92, 246, 0.15);
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
