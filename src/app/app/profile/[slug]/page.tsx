'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/utils';
import type { Event } from '@/types/occuro';
import {
  ArrowLeft, MapPin, Globe, AtSign, Users, CalendarDays, MessageCircle,
  UserMinus, UserPlus, Loader2, Heart, ImageOff, Lock, Flag, Ban, MoreVertical,
} from 'lucide-react';
import { ReportModal } from '@/components/report-modal';

interface FullProfile {
  id: string;
  full_name: string;
  username: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  instagram: string | null;
  interests: string[] | null;
}

type EventGroup = 'attending' | 'hosting';

/**
 * Public profile page at /app/profile/[slug] where slug is either a
 * username or a user id. Replaces the lightweight modal preview that
 * had scroll bleed-through and felt like a quick popup. This is a
 * full page so the user can scroll, navigate within it, and link/
 * share the URL.
 */
export default function PublicProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = use(params);
  const slug = rawSlug.trim();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [hostedEvents, setHostedEvents] = useState<Event[]>([]);
  const [attendingEvents, setAttendingEvents] = useState<Event[]>([]);
  const [friendCount, setFriendCount] = useState(0);
  const [friendshipStatus, setFriendshipStatus] = useState<'none' | 'friends' | 'pending_out' | 'pending_in'>('none');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [eventGroup, setEventGroup] = useState<EventGroup>('attending');
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const isSelf = user?.id === profile?.id;

  // ── Load everything ──────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    console.info(`[profile] resolving slug=${slug}`);
    // Resolve slug → real user id. UUIDs go through .eq('id', ...);
    // anything else is treated as a username. The previous version
    // tried `eq('username', slug)` first which failed for UUID slugs
    // because Postgres rejects the implicit-text-cast comparison
    // when RLS is involved.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    let resolved: FullProfile | null = null;
    const cols = 'id, full_name, username, avatar_url, banner_url, bio, location, website, instagram, interests';
    if (isUuid) {
      const { data, error } = await supabase
        .from('profiles').select(cols).eq('id', slug).maybeSingle();
      if (error) console.warn('[profile] id lookup failed:', error.message);
      resolved = (data as FullProfile | null) ?? null;
    } else {
      // Username lookup is case-insensitive — the unique index is on
      // lower(username) so .eq('username', 'Max') would miss a row
      // with username='max'. ilike with no wildcards behaves like
      // a case-insensitive eq.
      const { data, error } = await supabase
        .from('profiles').select(cols).ilike('username', slug).maybeSingle();
      if (error) console.warn('[profile] username lookup failed:', error.message);
      resolved = (data as FullProfile | null) ?? null;
      // If username didn't match, fall back to id in case the slug
      // happens to be a non-UUID id format.
      if (!resolved) {
        const fallback = await supabase
          .from('profiles').select(cols).eq('id', slug).maybeSingle();
        if (fallback.error) console.warn('[profile] fallback id lookup failed:', fallback.error.message);
        resolved = (fallback.data as FullProfile | null) ?? null;
      }
    }
    if (!resolved) {
      console.warn(`[profile] no row matched slug=${slug}`);
      setProfile(null);
      setLoading(false);
      return;
    }
    console.info(`[profile] resolved to`, resolved.id);
    setProfile(resolved);

    const today = new Date().toISOString().split('T')[0];
    const [hostedRes, statusesRes, friendsRes, friendshipRes] = await Promise.all([
      supabase
        .from('events')
        .select('*')
        .eq('organizer_profile_id', resolved.id)
        .eq('visibility', 'public')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(12),
      supabase
        .from('event_statuses')
        .select('event_id, status')
        .eq('user_id', resolved.id)
        .in('status', ['interested', 'confirmed', 'attended']),
      supabase
        .from('friendships')
        .select('user_id, friend_id, status')
        .or(`user_id.eq.${resolved.id},friend_id.eq.${resolved.id}`)
        .eq('status', 'accepted'),
      // Friendship between current user and this profile
      user
        ? supabase
            .from('friendships')
            .select('user_id, friend_id, status')
            .or(`and(user_id.eq.${user.id},friend_id.eq.${resolved.id}),and(user_id.eq.${resolved.id},friend_id.eq.${user.id})`)
            .limit(1)
        : Promise.resolve({ data: null }),
    ]);

    setHostedEvents((hostedRes.data ?? []) as Event[]);

    // Resolve attending event IDs → full events
    const eventIds = ((statusesRes.data ?? []) as Array<{ event_id: string }>).map((s) => s.event_id);
    if (eventIds.length > 0) {
      const { data } = await supabase
        .from('events')
        .select('*')
        .in('id', eventIds)
        .eq('visibility', 'public')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(12);
      setAttendingEvents((data ?? []) as Event[]);
    }

    // Distinct friend count
    const ids = new Set<string>();
    ((friendsRes.data ?? []) as Array<{ user_id: string; friend_id: string }>).forEach((f) => {
      const other = f.user_id === resolved!.id ? f.friend_id : f.user_id;
      if (other) ids.add(other);
    });
    setFriendCount(ids.size);

    // Friendship status
    if (user) {
      const row = ((friendshipRes.data ?? []) as Array<{ user_id: string; friend_id: string; status: string }>)[0];
      if (!row) setFriendshipStatus('none');
      else if (row.status === 'accepted') setFriendshipStatus('friends');
      else if (row.status === 'pending' && row.user_id === user.id) setFriendshipStatus('pending_out');
      else if (row.status === 'pending' && row.friend_id === user.id) setFriendshipStatus('pending_in');
      else setFriendshipStatus('none');
    }

    setLoading(false);
  }, [slug, supabase, user]);

  useEffect(() => {
    // Wait for the auth context to finish initialising before kicking
    // off the profile fetch — the profiles RLS policy is `to
    // authenticated using (true)`, so an anon-role query during the
    // brief window before the session cookie is hydrated would silently
    // return null and surface as "Profil nicht gefunden".
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  // Close menu on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // ── Friend actions ────────────────────────────────────────────────
  async function sendRequest() {
    if (!user || !profile || busy) return;
    setBusy(true);
    await supabase.from('friendships').insert({
      user_id: user.id,
      friend_id: profile.id,
      status: 'pending',
    });
    setFriendshipStatus('pending_out');
    setBusy(false);
  }

  async function cancelRequest() {
    if (!user || !profile || busy) return;
    setBusy(true);
    await supabase
      .from('friendships')
      .delete()
      .match({ user_id: user.id, friend_id: profile.id, status: 'pending' });
    setFriendshipStatus('none');
    setBusy(false);
  }

  async function acceptRequest() {
    if (!user || !profile || busy) return;
    setBusy(true);
    await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .match({ user_id: profile.id, friend_id: user.id, status: 'pending' });
    setFriendshipStatus('friends');
    setBusy(false);
  }

  async function removeFriend() {
    if (!user || !profile || busy) return;
    if (!confirm(`${profile.full_name} aus deinen Freunden entfernen?`)) return;
    setBusy(true);
    await supabase
      .from('friendships')
      .delete()
      .or(`and(user_id.eq.${user.id},friend_id.eq.${profile.id}),and(user_id.eq.${profile.id},friend_id.eq.${user.id})`)
      .eq('status', 'accepted');
    setFriendshipStatus('none');
    setBusy(false);
  }

  async function blockUser() {
    if (!user || !profile || busy) return;
    if (!confirm(`${profile.full_name} blockieren? Du erhältst keine Nachrichten mehr.`)) return;
    setBusy(true);
    await supabase.from('user_blocks').insert({
      blocker_id: user.id,
      blocked_id: profile.id,
    });
    // Also remove any existing friendship row
    await supabase
      .from('friendships')
      .delete()
      .or(`and(user_id.eq.${user.id},friend_id.eq.${profile.id}),and(user_id.eq.${profile.id},friend_id.eq.${user.id})`);
    setBusy(false);
    router.push('/app/friends');
  }

  // ── Render ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-20 flex justify-center">
        <Loader2 size={24} className="animate-spin text-muted-fg" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center text-muted-fg">
        <p className="text-sm font-medium">Profil nicht gefunden</p>
        <Link href="/app/friends" className="inline-flex items-center gap-1 mt-3 text-[13px] text-violet-400 hover:text-violet-300">
          <ArrowLeft size={13} /> Zurück zu Freunden
        </Link>
      </div>
    );
  }

  const initial = profile.full_name.charAt(0).toUpperCase();
  const visibleEvents = eventGroup === 'attending' ? attendingEvents : hostedEvents;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-fg hover:text-foreground transition-colors"
      >
        <ArrowLeft size={15} /> Zurück
      </button>

      {/* Profile header card — banner + avatar/identity below it */}
      <div className="rounded-2xl border border-border-subtle bg-surface overflow-hidden">
        <div className="h-32 sm:h-40 bg-gradient-to-br from-violet-500/15 to-purple-600/15 relative">
          {profile.banner_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.banner_url} alt="" className="w-full h-full object-cover" />
          )}
          {/* 3-dots menu top right */}
          {!isSelf && user && (
            <div className="absolute top-3 right-3">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="p-2 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-colors"
                aria-label="Mehr"
              >
                <MoreVertical size={15} />
              </button>
              {menuOpen && (
                <div className="absolute top-full right-0 mt-1 w-56 rounded-2xl border border-border-subtle bg-surface shadow-2xl shadow-black/40 overflow-hidden z-30 animate-fade-in">
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); setReportOpen(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-[13px] hover:bg-elevated transition-colors"
                  >
                    <Flag size={15} className="text-amber-400" />
                    Nutzer melden
                  </button>
                  <button
                    type="button"
                    onClick={blockUser}
                    disabled={busy}
                    className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-red-400 hover:bg-red-500/5 transition-colors border-t border-border-subtle disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />}
                    Blockieren
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Avatar row */}
        <div className="px-6 pt-5 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-elevated ring-2 ring-border-subtle flex items-center justify-center text-2xl font-bold overflow-hidden flex-shrink-0">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-muted-fg">{initial}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-heading font-bold truncate">{profile.full_name}</h1>
              {profile.username && (
                <p className="text-[13px] text-muted-fg truncate">@{profile.username}</p>
              )}
            </div>
          </div>

          {profile.bio && (
            <p className="text-[14px] leading-relaxed mt-4">{profile.bio}</p>
          )}

          {/* Stats inline pills */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-elevated border border-border-subtle">
              <Users size={13} className="text-violet-400" />
              <span className="text-[13px] font-semibold">{friendCount}</span>
              <span className="text-[12px] text-muted-fg">Freunde</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-elevated border border-border-subtle">
              <CalendarDays size={13} className="text-violet-400" />
              <span className="text-[13px] font-semibold">{hostedEvents.length + attendingEvents.length}</span>
              <span className="text-[12px] text-muted-fg">Events</span>
            </div>
          </div>

          {/* Location / website / insta row */}
          {(profile.location || profile.website || profile.instagram) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-fg mt-4">
              {profile.location && (
                <span className="flex items-center gap-1.5"><MapPin size={12} />{profile.location}</span>
              )}
              {profile.website && (
                <a
                  href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                >
                  <Globe size={12} />{profile.website.replace(/^https?:\/\//, '')}
                </a>
              )}
              {profile.instagram && (
                <a
                  href={`https://instagram.com/${profile.instagram.replace(/^@/, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                >
                  <AtSign size={12} />{profile.instagram.replace(/^@/, '')}
                </a>
              )}
            </div>
          )}

          {/* Interests */}
          {profile.interests && profile.interests.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-4">
              {profile.interests.slice(0, 12).map((interest) => (
                <span key={interest} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted text-foreground/70">
                  {interest}
                </span>
              ))}
            </div>
          )}

          {/* Action bar */}
          {!isSelf && user && (
            <div className="flex gap-2 mt-5">
              <Link
                href={`/app/chat?with=${profile.id}`}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-[13px] font-semibold hover:bg-violet-500 transition-colors"
              >
                <MessageCircle size={14} /> Nachricht
              </Link>
              {friendshipStatus === 'friends' && (
                <button
                  onClick={removeFriend}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-border-subtle text-[13px] font-medium text-muted-fg hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5 transition-colors disabled:opacity-50"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <UserMinus size={13} />}
                  Entfernen
                </button>
              )}
              {friendshipStatus === 'none' && (
                <button
                  onClick={sendRequest}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-[13px] font-semibold hover:bg-violet-500 transition-colors disabled:opacity-50"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                  Hinzufügen
                </button>
              )}
              {friendshipStatus === 'pending_out' && (
                <button
                  onClick={cancelRequest}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-border-subtle text-[13px] font-medium hover:bg-elevated transition-colors disabled:opacity-50"
                >
                  Anfrage zurückziehen
                </button>
              )}
              {friendshipStatus === 'pending_in' && (
                <button
                  onClick={acceptRequest}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-green-500 text-white text-[13px] font-semibold hover:bg-green-400 transition-colors disabled:opacity-50"
                >
                  Anfrage annehmen
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Events tabs */}
      {(hostedEvents.length > 0 || attendingEvents.length > 0) && (
        <div>
          <div className="flex rounded-2xl bg-muted p-1 max-w-md">
            <button
              type="button"
              onClick={() => setEventGroup('attending')}
              className={`flex-1 py-2 rounded-xl text-[12px] font-medium transition-all ${
                eventGroup === 'attending'
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'text-muted-fg hover:text-foreground'
              }`}
            >
              Teilnahmen ({attendingEvents.length})
            </button>
            <button
              type="button"
              onClick={() => setEventGroup('hosting')}
              className={`flex-1 py-2 rounded-xl text-[12px] font-medium transition-all ${
                eventGroup === 'hosting'
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'text-muted-fg hover:text-foreground'
              }`}
            >
              Eigene Events ({hostedEvents.length})
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {visibleEvents.length === 0 ? (
              <p className="text-[12px] text-muted-fg italic py-6 text-center">
                {eventGroup === 'attending'
                  ? 'Aktuell keine geplanten Teilnahmen.'
                  : 'Hostet aktuell keine eigenen Events.'}
              </p>
            ) : (
              visibleEvents.map((event) => (
                <Link
                  key={event.id}
                  href={`/app/event/${event.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border-subtle bg-surface hover:bg-elevated/50 hover:border-border-strong transition-colors"
                >
                  <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                    {event.banner_url || event.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={event.banner_url ?? event.image_url ?? ''} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageOff size={14} className="text-muted-fg/30" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold truncate flex items-center gap-1.5">
                      {event.visibility === 'private' && <Lock size={11} className="text-muted-fg" />}
                      {event.title}
                    </p>
                    <p className="text-[12px] text-muted-fg truncate">
                      {formatDate(event.date)} · {event.location}
                    </p>
                  </div>
                  <Heart size={12} className="text-muted-fg/40 flex-shrink-0" />
                </Link>
              ))
            )}
          </div>
        </div>
      )}

      {/* Report modal */}
      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="profile"
        targetId={profile.id}
        targetName={profile.full_name}
      />
    </div>
  );
}
