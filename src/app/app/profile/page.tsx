'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Event, EventStatus } from '@/types/occuro';
import { formatDate, formatTime, getCategoryColor } from '@/lib/utils';
import Link from 'next/link';
import {
  MapPin, Globe, AtSign, Settings, Heart, CheckCircle2,
  Bookmark, Calendar, Clock, ImageOff, Lock, Pencil,
  Grid3X3, X, Save, Loader2, Users,
} from 'lucide-react';

type ProfileTab = 'events' | 'private' | 'saved';
type EventStatusFilter = 'interested' | 'attending' | 'past';
type PrivateTimeFilter = 'upcoming' | 'past';

export default function ProfilePage() {
  const { user, profile } = useAuth();
  const supabase = createClient();

  const [profileTab, setProfileTab] = useState<ProfileTab>('events');
  const [statusFilter, setStatusFilter] = useState<EventStatusFilter>('interested');
  const [privateTimeFilter, setPrivateTimeFilter] = useState<PrivateTimeFilter>('upcoming');

  const [events, setEvents] = useState<Event[]>([]);
  const [statuses, setStatuses] = useState<Record<string, EventStatus>>({});
  const [savedEventIds, setSavedEventIds] = useState<string[]>([]);
  const [friendCount, setFriendCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (user) void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchData() {
    setLoading(true);
    const [statusesRes, friendsRes, savedRes] = await Promise.all([
      supabase.from('event_statuses').select('event_id, status').eq('user_id', user!.id),
      supabase.from('friendships').select('id', { count: 'exact', head: true })
        .or(`user_id.eq.${user!.id},friend_id.eq.${user!.id}`)
        .eq('status', 'accepted'),
      supabase.from('saved_events').select('event_id').eq('user_id', user!.id),
    ]);

    const statusData = statusesRes.data ?? [];
    const map: Record<string, EventStatus> = {};
    statusData.forEach((s: { event_id: string; status: EventStatus }) => {
      map[s.event_id] = s.status;
    });
    setStatuses(map);
    setFriendCount(friendsRes.count ?? 0);

    const savedIds = (savedRes.data ?? []).map((r: { event_id: string }) => r.event_id);
    setSavedEventIds(savedIds);

    // Collect all event IDs we need: those with a status, saved ones, and own events
    const eventIds = new Set<string>([
      ...statusData.map((s: { event_id: string }) => s.event_id),
      ...savedIds,
    ]);

    // Also fetch events the user owns (private events appear here even without a status)
    const { data: ownEvents } = await supabase
      .from('events')
      .select('*')
      .eq('organizer_profile_id', user!.id);
    (ownEvents ?? []).forEach((e: Event) => eventIds.add(e.id));

    if (eventIds.size > 0) {
      const { data: eventsData } = await supabase
        .from('events')
        .select('*')
        .in('id', Array.from(eventIds))
        .order('date', { ascending: true });
      setEvents(eventsData ?? []);
    } else {
      setEvents([]);
    }
    setLoading(false);
  }

  // ── Derived event lists ─────────────────────────────────────────
  const interestedEvents = useMemo(
    () =>
      events.filter((e) =>
        e.visibility === 'public' && statuses[e.id] === 'interested' && (e.end_date ?? e.date) >= today
      ),
    [events, statuses, today],
  );
  const attendingEvents = useMemo(
    () =>
      events.filter(
        (e) =>
          e.visibility === 'public' &&
          (statuses[e.id] === 'confirmed' || statuses[e.id] === 'attended') &&
          (e.end_date ?? e.date) >= today,
      ),
    [events, statuses, today],
  );
  const pastEvents = useMemo(
    () =>
      events
        .filter((e) => {
          if (e.visibility !== 'public') return false;
          const s = statuses[e.id];
          if (s !== 'interested' && s !== 'confirmed' && s !== 'attended') return false;
          return (e.end_date ?? e.date) < today;
        })
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [events, statuses, today],
  );
  const savedEventsList = useMemo(
    () => events.filter((e) => savedEventIds.includes(e.id)),
    [events, savedEventIds],
  );
  const privateEvents = useMemo(() => {
    // Own private events (the user is the creator) — invited private events
    // come through event_statuses + status='confirmed' which lands them in
    // attendingEvents above. For full mobile parity we could fetch
    // event_invitations too, but the simpler "own private" rule covers the
    // common case.
    return events.filter((e) => e.visibility === 'private' && e.organizer_profile_id === user?.id);
  }, [events, user?.id]);

  const filteredPrivateEvents = useMemo(
    () =>
      privateEvents.filter((e) => {
        const isPast = (e.end_date ?? e.date) < today;
        return privateTimeFilter === 'past' ? isPast : !isPast;
      }),
    [privateEvents, privateTimeFilter, today],
  );

  const interestedCount = interestedEvents.length;
  const attendingCount = attendingEvents.length;
  const pastCount = pastEvents.length;

  const activeStatusEvents =
    statusFilter === 'interested' ? interestedEvents
    : statusFilter === 'attending' ? attendingEvents
    : pastEvents;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* ─── Profile header card ─── */}
      <div className="rounded-2xl border border-border-subtle bg-surface overflow-hidden">
        {/* Banner */}
        <div className="h-40 bg-gradient-to-br from-violet-500/20 to-purple-600/20 relative">
          {profile?.banner_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.banner_url} alt="" className="w-full h-full object-cover" />
          )}
          <div className="absolute top-3 right-3 flex gap-2">
            <button
              onClick={() => setEditOpen(true)}
              className="p-2 rounded-full bg-black/30 backdrop-blur-sm text-white hover:bg-black/50 transition-colors"
              aria-label="Profil bearbeiten"
            >
              <Pencil size={15} />
            </button>
            <Link
              href="/app/settings"
              className="p-2 rounded-full bg-black/30 backdrop-blur-sm text-white hover:bg-black/50 transition-colors"
              aria-label="Einstellungen"
            >
              <Settings size={15} />
            </Link>
          </div>
        </div>

        {/* Avatar + identity */}
        <div className="px-6 pb-6">
          <div className="w-24 h-24 rounded-full bg-elevated border-4 border-surface -mt-12 relative z-10 flex items-center justify-center text-2xl font-bold overflow-hidden">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-muted-fg">{profile?.full_name?.charAt(0).toUpperCase()}</span>
            )}
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <h1 className="text-xl font-heading font-bold">{profile?.full_name}</h1>
              {profile?.username && (
                <p className="text-[13px] text-muted-fg">@{profile.username}</p>
              )}
            </div>

            {profile?.bio && <p className="text-sm leading-relaxed">{profile.bio}</p>}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-fg">
              {profile?.location && (
                <span className="flex items-center gap-1.5"><MapPin size={13} strokeWidth={1.6} />{profile.location}</span>
              )}
              {profile?.website && (
                <a
                  href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                >
                  <Globe size={13} strokeWidth={1.6} />{profile.website.replace(/^https?:\/\//, '')}
                </a>
              )}
              {profile?.instagram && (
                <a
                  href={`https://instagram.com/${profile.instagram.replace(/^@/, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                >
                  <AtSign size={13} strokeWidth={1.6} />{profile.instagram.replace(/^@/, '')}
                </a>
              )}
            </div>

            {/* Stats */}
            <div className="flex gap-6 pt-2">
              <Link href="/app/friends" className="text-center group">
                <p className="text-lg font-heading font-bold group-hover:text-violet-500 transition-colors">{friendCount}</p>
                <p className="text-[11px] text-muted-fg">Freunde</p>
              </Link>
              <div className="text-center">
                <p className="text-lg font-heading font-bold">{interestedCount}</p>
                <p className="text-[11px] text-muted-fg">Interessiert</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-heading font-bold">{attendingCount}</p>
                <p className="text-[11px] text-muted-fg">Bestätigt</p>
              </div>
            </div>

            {profile?.interests && profile.interests.length > 0 && (
              <div className="flex gap-2 flex-wrap pt-1">
                {profile.interests.map((interest) => (
                  <span key={interest} className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-muted text-foreground/70">
                    {interest}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Top tab bar (Events / Privat / Gespeichert) ─── */}
      <div className="flex rounded-2xl bg-muted p-1">
        {([
          { key: 'events', label: 'Events', icon: Grid3X3 },
          { key: 'private', label: 'Privat', icon: Lock },
          { key: 'saved', label: 'Gespeichert', icon: Bookmark },
        ] as const).map((t) => {
          const Icon = t.icon;
          const active = profileTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setProfileTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-medium transition-all duration-200 ${
                active ? 'bg-surface text-foreground shadow-sm' : 'text-muted-fg hover:text-foreground'
              }`}
            >
              <Icon size={14} strokeWidth={active ? 2.2 : 1.6} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ─── Events tab: status filter pills + list ─── */}
      {profileTab === 'events' && (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { key: 'interested', label: 'Interessiert', count: interestedCount },
              { key: 'attending', label: 'Bestätigt', count: attendingCount },
              { key: 'past', label: 'Vergangen', count: pastCount },
            ] as const).map(({ key, label, count }) => {
              const active = statusFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`flex flex-col items-center py-2.5 rounded-xl transition-all ${
                    active ? 'bg-violet-500/15 text-violet-400' : 'bg-elevated text-muted-fg hover:text-foreground'
                  }`}
                >
                  <span className={`text-base font-heading font-bold ${active ? 'text-violet-400' : 'text-foreground'}`}>{count}</span>
                  <span className="text-[10px] mt-0.5">{label}</span>
                </button>
              );
            })}
          </div>
          <EventsListSection
            loading={loading}
            events={activeStatusEvents}
            statuses={statuses}
            emptyText={
              statusFilter === 'interested' ? 'Noch keine interessierten Events.'
              : statusFilter === 'attending' ? 'Noch keine bestätigten Events.'
              : 'Keine vergangenen Events.'
            }
            emptyIcon={statusFilter === 'past' ? Clock : statusFilter === 'attending' ? CheckCircle2 : Heart}
          />
        </>
      )}

      {/* ─── Private events tab ─── */}
      {profileTab === 'private' && (
        <>
          {privateEvents.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5">
              {([
                {
                  key: 'upcoming' as const,
                  label: 'Anstehend',
                  count: privateEvents.filter((e) => (e.end_date ?? e.date) >= today).length,
                },
                {
                  key: 'past' as const,
                  label: 'Vergangen',
                  count: privateEvents.filter((e) => (e.end_date ?? e.date) < today).length,
                },
              ]).map(({ key, label, count }) => {
                const active = privateTimeFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => setPrivateTimeFilter(key)}
                    className={`flex flex-col items-center py-2.5 rounded-xl transition-all ${
                      active ? 'bg-violet-500/15 text-violet-400' : 'bg-elevated text-muted-fg hover:text-foreground'
                    }`}
                  >
                    <span className={`text-base font-heading font-bold ${active ? 'text-violet-400' : 'text-foreground'}`}>{count}</span>
                    <span className="text-[10px] mt-0.5">{label}</span>
                  </button>
                );
              })}
            </div>
          )}
          <EventsListSection
            loading={loading}
            events={filteredPrivateEvents}
            statuses={statuses}
            emptyText={
              privateEvents.length === 0
                ? 'Du hast noch keine privaten Events.'
                : privateTimeFilter === 'past'
                  ? 'Keine vergangenen privaten Events.'
                  : 'Keine anstehenden privaten Events.'
            }
            emptyIcon={Lock}
          />
        </>
      )}

      {/* ─── Saved events tab ─── */}
      {profileTab === 'saved' && (
        <EventsListSection
          loading={loading}
          events={savedEventsList}
          statuses={statuses}
          emptyText="Du hast noch keine Events gespeichert."
          emptyIcon={Bookmark}
        />
      )}

      {/* ─── Edit profile modal ─── */}
      {editOpen && (
        <EditProfileModal
          profile={profile}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            // Force a fresh client-side reload so AuthContext picks up the
            // updated profile fields. A simple router refresh isn't enough
            // because the auth-context state is held in React state, not
            // Server Components.
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────

interface EventsListSectionProps {
  loading: boolean;
  events: Event[];
  statuses: Record<string, EventStatus>;
  emptyText: string;
  emptyIcon: typeof Heart;
}

function EventsListSection({ loading, events, statuses, emptyText, emptyIcon: Icon }: EventsListSectionProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-surface border border-border-subtle animate-pulse" />
        ))}
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
        <Icon size={32} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2 stagger-children">
      {events.map((event) => (
        <Link
          key={event.id}
          href={`/app/event/${event.id}`}
          className="group flex items-center gap-4 p-4 rounded-xl border border-border-subtle bg-surface hover:bg-elevated/50 hover:border-border-strong transition-all duration-200"
        >
          <div className="w-14 h-14 rounded-lg bg-muted overflow-hidden flex-shrink-0">
            {event.banner_url || event.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.banner_url ?? event.image_url ?? ''} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageOff size={16} strokeWidth={1.4} className="text-muted-fg/30" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[14px] truncate">{event.title}</h3>
              {event.visibility === 'private' && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800 flex-shrink-0">
                  <Lock size={9} /> Privat
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[12px] text-muted-fg mt-0.5">
              <span className="flex items-center gap-1"><Calendar size={11} />{formatDate(event.date)}</span>
              <span className="flex items-center gap-1"><Clock size={11} />{formatTime(event.time)}</span>
              <span className="flex items-center gap-1 min-w-0">
                <MapPin size={11} className="flex-shrink-0" />
                <span className="truncate">{event.location}</span>
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span
              className="px-2.5 py-1 rounded-full text-[10px] font-semibold text-white"
              style={{ backgroundColor: getCategoryColor(event.category) }}
            >
              {event.category}
            </span>
            {statuses[event.id] && (
              <span className={`flex items-center gap-1 text-[10px] font-medium ${
                statuses[event.id] === 'confirmed' || statuses[event.id] === 'attended' ? 'text-green-600' :
                statuses[event.id] === 'interested' ? 'text-pink-500' :
                statuses[event.id] === 'saved' ? 'text-violet-500' : 'text-muted-fg'
              }`}>
                {statuses[event.id] === 'confirmed' || statuses[event.id] === 'attended' ? <><CheckCircle2 size={10} /> Bestätigt</> :
                 statuses[event.id] === 'interested' ? <><Heart size={10} /> Interessiert</> :
                 statuses[event.id] === 'saved' ? <><Bookmark size={10} /> Gespeichert</> : null}
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Edit profile modal
// ────────────────────────────────────────────────────────────────────

interface EditProfileModalProps {
  profile: ReturnType<typeof useAuth>['profile'];
  onClose: () => void;
  onSaved: () => void;
}

function EditProfileModal({ profile, onClose, onSaved }: EditProfileModalProps) {
  const supabase = createClient();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [location, setLocation] = useState(profile?.location ?? '');
  const [website, setWebsite] = useState(profile?.website ?? '');
  const [instagram, setInstagram] = useState(profile?.instagram ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '');
  const [bannerUrl, setBannerUrl] = useState(profile?.banner_url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!profile?.id) return;
    setSaving(true);
    setError(null);
    const trimmedUsername = username.trim().toLowerCase();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        username: trimmedUsername || null,
        bio: bio.trim() || null,
        location: location.trim() || null,
        website: website.trim() || null,
        instagram: instagram.trim().replace(/^@/, '') || null,
        avatar_url: avatarUrl.trim() || null,
        banner_url: bannerUrl.trim() || null,
      })
      .eq('id', profile.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-in">
      <div className="w-full sm:max-w-lg bg-surface rounded-t-3xl sm:rounded-3xl border border-border-subtle max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <h2 className="text-lg font-heading font-bold">Profil bearbeiten</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-elevated transition-colors"
            aria-label="Schließen"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <Field label="Name">
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Dein Name"
              className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm focus:outline-none focus:border-violet-500/40"
            />
          </Field>
          <Field label="Username" hint="Eindeutig, nur Buchstaben, Zahlen und Unterstriche.">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg text-sm">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder="username"
                className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm focus:outline-none focus:border-violet-500/40"
              />
            </div>
          </Field>
          <Field label="Bio">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Kurzbeschreibung über dich"
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm resize-none focus:outline-none focus:border-violet-500/40"
            />
          </Field>
          <Field label="Standort">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="z.B. Wien, Österreich"
              className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm focus:outline-none focus:border-violet-500/40"
            />
          </Field>
          <Field label="Website">
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://deine-seite.com"
              className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm focus:outline-none focus:border-violet-500/40"
            />
          </Field>
          <Field label="Instagram">
            <input
              type="text"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="dein_instagram"
              className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm focus:outline-none focus:border-violet-500/40"
            />
          </Field>
          <Field label="Avatar URL" hint="Bild-Upload kommt bald — vorerst Direktlink.">
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm focus:outline-none focus:border-violet-500/40"
            />
          </Field>
          <Field label="Banner URL">
            <input
              type="url"
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm focus:outline-none focus:border-violet-500/40"
            />
          </Field>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[12px] text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border-subtle flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border-subtle text-sm font-medium hover:bg-elevated transition-colors"
            disabled={saving}
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !fullName.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-semibold text-foreground/80">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-fg">{hint}</p>}
    </div>
  );
}
