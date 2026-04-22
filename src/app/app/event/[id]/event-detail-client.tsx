'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Event } from '@/types/occuro';
import { formatDate, formatTime, getCategoryColor } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Calendar, Clock, MapPin, Heart, CheckCircle2,
  Users, Globe, Ticket, ExternalLink, Lock,
  Gift, Award, Sparkles, Loader2, MessageCircle, Send,
  Trophy, Trash2, Flag, X as XIcon,
} from 'lucide-react';
import { ReportModal } from '@/components/report-modal';
import { EventBanner } from '@/components/event-banner';

type UserStatus = 'interested' | 'confirmed' | 'attended' | 'not-interested' | 'saved' | null;

interface Giveaway {
  id: string;
  event_id: string;
  prize_description: string;
  winner_count: number;
  draw_at: string;
  drawn: boolean;
  drawn_at: string | null;
}

interface GiveawayWinner {
  user_id: string;
  verification_code: string;
  verified: boolean;
}

interface FeedPost {
  id: string;
  event_id: string;
  author_profile_id: string | null;
  author_org_id: string | null;
  content_type: 'text' | 'image' | 'video' | 'link';
  text: string | null;
  image_url: string | null;
  link_url: string | null;
  link_title: string | null;
  created_at: string;
}

interface AuthorInfo {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface FriendParticipant {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  status: 'interested' | 'confirmed' | 'attended';
}

export default function EventDetailClient({
  id,
  initialEvent,
}: {
  id: string;
  initialEvent: Event | null;
}) {
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();

  // "Zurück" should return to wherever the user came from (profile,
  // friends list, Entdecken, …). If there's no history — e.g. the user
  // opened the event via a direct share link — fall back to Entdecken.
  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/app');
    }
  }, [router]);

  // Seed state from the server-prefetched event so the page renders
  // immediately with correct data — even if the client auth is in a
  // borked state and can't re-fetch. Everything else still fetches
  // client-side via loadAll below.
  const [event, setEvent] = useState<Event | null>(initialEvent);
  const [status, setStatus] = useState<UserStatus>(null);
  const [loading, setLoading] = useState(!initialEvent);
  const [reportOpen, setReportOpen] = useState(false);
  // Pending invitation row for the current user, if any. Drives the
  // accept/decline banner at the top of the page (mirrors the mobile
  // app's behaviour where a private invite shows up as an inline CTA).
  const [pendingInvite, setPendingInvite] = useState<{ id: string } | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  // Giveaway state
  const [giveaway, setGiveaway] = useState<Giveaway | null>(null);
  const [giveawayEntryCount, setGiveawayEntryCount] = useState(0);
  const [giveawayWinners, setGiveawayWinners] = useState<GiveawayWinner[]>([]);

  // Feed state
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
  const [feedAuthors, setFeedAuthors] = useState<Record<string, AuthorInfo>>({});
  const [newPostText, setNewPostText] = useState('');
  const [postingFeed, setPostingFeed] = useState(false);

  // Friends who are going to this event (mobile parity with the
  // "Deine Freunde gehen hin" section in EventDetailsModal).
  const [friendParticipants, setFriendParticipants] = useState<FriendParticipant[]>([]);
  const [expandedFriendStatus, setExpandedFriendStatus] = useState<FriendParticipant['status'] | null>(null);

  // Authoritative RSVP counts computed live from event_statuses. The
  // denormalized events.interested_count / confirmed_count columns are
  // supposed to be kept in sync by DB triggers but we've seen them
  // drift (e.g. 0 displayed while friends are clearly going), so we
  // compute from the source of truth every load.
  const [computedCounts, setComputedCounts] = useState<{ interested: number; confirmed: number }>({ interested: 0, confirmed: 0 });

  // Chat room id for this event — resolved so the "Zum Event-Chat"
  // button can deep-link into the specific room instead of dumping
  // the user on the global messages list.
  const [eventChatRoomId, setEventChatRoomId] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  // ── Load everything ──────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const [eventRes, statusRes, savedRes, giveawayRes, inviteRes] = await Promise.all([
      supabase.from('events').select('*').eq('id', id).single(),
      user
        ? supabase.from('event_statuses').select('status').eq('event_id', id).eq('user_id', user.id).maybeSingle()
        : Promise.resolve({ data: null }),
      // saved_events lookup — separate from event_statuses on mobile,
      // and the profile page reads from this table too.
      user
        ? supabase.from('saved_events').select('event_id').eq('event_id', id).eq('user_id', user.id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('event_giveaways').select('*').eq('event_id', id).maybeSingle(),
      // Pending invitation for the current user — drives the accept/
      // decline banner. Mobile parity: see useInvitations.ts.
      user
        ? supabase
            .from('event_invitations')
            .select('id')
            .eq('event_id', id)
            .eq('invited_user_id', user.id)
            .eq('status', 'pending')
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    setPendingInvite((inviteRes.data as { id: string } | null) ?? null);

    if (eventRes.error || !eventRes.data) {
      // Don't null out a server-prefetched event on a transient
      // client fetch error — the server-side render was
      // authoritative and we'd rather keep showing it.
      setLoading(false);
      return;
    }
    setEvent(eventRes.data as Event);
    // saved_events row takes precedence over event_statuses for the
    // visual "saved" state — saving an event you've also marked as
    // interested should still show the Save button as active.
    const savedRow = savedRes.data as { event_id: string } | null;
    if (savedRow) {
      setStatus('saved');
    } else {
      setStatus((statusRes.data as { status: UserStatus } | null)?.status ?? null);
    }

    const gw = (giveawayRes.data as Giveaway | null) ?? null;
    setGiveaway(gw);

    if (gw) {
      const [{ count }, winnersRes] = await Promise.all([
        supabase
          .from('giveaway_entries')
          .select('id', { count: 'exact', head: true })
          .eq('giveaway_id', gw.id),
        gw.drawn
          ? supabase.from('giveaway_winners').select('user_id, verification_code, verified').eq('giveaway_id', gw.id)
          : Promise.resolve({ data: [] }),
      ]);
      setGiveawayEntryCount(count ?? 0);
      setGiveawayWinners((winnersRes.data ?? []) as GiveawayWinner[]);
    }

    // Feed posts
    const { data: posts } = await supabase
      .from('event_feed_posts')
      .select('id, event_id, author_profile_id, author_org_id, content_type, text, image_url, link_url, link_title, created_at')
      .eq('event_id', id)
      .order('created_at', { ascending: false })
      .limit(50);

    setFeedPosts((posts ?? []) as FeedPost[]);

    const authorIds = [...new Set((posts ?? []).map((p) => p.author_profile_id).filter(Boolean))] as string[];
    if (authorIds.length > 0) {
      const { data: authors } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', authorIds);
      const map: Record<string, AuthorInfo> = {};
      (authors ?? []).forEach((a) => { map[a.id] = a as AuthorInfo; });
      setFeedAuthors(map);
    }

    // Resolve the event's chat room id so the "Zum Event-Chat" button
    // can deep-link into the specific conversation. RLS only returns
    // a row here if the user is actually a participant, which is
    // exactly when we want the button to work.
    const { data: room } = await supabase
      .from('chat_rooms')
      .select('id')
      .eq('event_id', id)
      .eq('type', 'event_group')
      .maybeSingle();
    setEventChatRoomId((room as { id: string } | null)?.id ?? null);

    // Authoritative counts — pulled live from event_statuses since the
    // cached columns on events drift out of sync.
    const { data: allStatuses } = await supabase
      .from('event_statuses')
      .select('status')
      .eq('event_id', id)
      .in('status', ['interested', 'confirmed']);
    setComputedCounts({
      interested: (allStatuses ?? []).filter((s) => s.status === 'interested').length,
      confirmed: (allStatuses ?? []).filter((s) => s.status === 'confirmed').length,
    });

    // Friend participation (mobile parity): show which of my accepted
    // friends are interested / confirmed / attended for this event.
    if (user) {
      const { data: friendships } = await supabase
        .from('friendships')
        .select('user_id, friend_id, status')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
        .eq('status', 'accepted');
      const friendIds = (friendships ?? []).map((f) =>
        f.user_id === user.id ? f.friend_id : f.user_id,
      );
      if (friendIds.length > 0) {
        const [statusesRes, profilesRes] = await Promise.all([
          supabase
            .from('event_statuses')
            .select('user_id, status')
            .eq('event_id', id)
            .in('user_id', friendIds)
            .in('status', ['interested', 'confirmed', 'attended']),
          supabase
            .from('profiles')
            .select('id, full_name, username, avatar_url')
            .in('id', friendIds),
        ]);
        const profMap = new Map<string, { id: string; full_name: string | null; username: string | null; avatar_url: string | null }>();
        (profilesRes.data ?? []).forEach((p) => profMap.set(p.id, p));
        const participants: FriendParticipant[] = (statusesRes.data ?? [])
          .map((s) => {
            const prof = profMap.get(s.user_id);
            if (!prof) return null;
            return {
              id: prof.id,
              full_name: prof.full_name,
              username: prof.username,
              avatar_url: prof.avatar_url,
              status: s.status as FriendParticipant['status'],
            };
          })
          .filter((x): x is FriendParticipant => x !== null);
        setFriendParticipants(participants);
      } else {
        setFriendParticipants([]);
      }
    } else {
      setFriendParticipants([]);
    }

    setLoading(false);
  }, [supabase, id, user]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ── Status (RSVP) actions ────────────────────────────────────────
  async function updateStatus(newStatus: UserStatus) {
    if (!user || !event) return;
    // "saved" lives in its own table on mobile (saved_events). The
    // webapp profile page reads from saved_events too, so a save
    // written to event_statuses would never appear in the Gespeichert
    // tab. Route saves to the dedicated table to match.
    if (newStatus === 'saved') {
      if (status === 'saved') {
        await supabase.from('saved_events').delete().eq('event_id', event.id).eq('user_id', user.id);
        setStatus(null);
      } else {
        await supabase.from('saved_events').upsert(
          { event_id: event.id, user_id: user.id },
          { onConflict: 'event_id,user_id' },
        );
        setStatus('saved');
        // Saving an invited event also counts as engagement → auto-
        // accept the pending invitation, same as the RSVP path below.
        if (pendingInvite) {
          const { error: invErr } = await supabase
            .from('event_invitations')
            .update({ status: 'accepted' })
            .eq('id', pendingInvite.id);
          if (invErr) {
            console.warn('[event] auto-accept invitation after save failed:', invErr.message);
          } else {
            setPendingInvite(null);
          }
        }
      }
      return;
    }
    if (newStatus === status) {
      await supabase.from('event_statuses').delete().eq('event_id', event.id).eq('user_id', user.id);
      setStatus(null);
    } else {
      await supabase.from('event_statuses').upsert(
        { event_id: event.id, user_id: user.id, status: newStatus },
        { onConflict: 'event_id,user_id' },
      );
      setStatus(newStatus);
    }

    // If the user has a pending invitation for this event AND they
    // just engaged positively (interested / confirmed), auto-accept
    // the invitation. Without this, clicking "Zusagen" on an invited
    // private event left the invitation in pending state forever and
    // the event never showed up in the user's Privat tab on profile
    // (which keys off accepted invitations).
    if (
      pendingInvite &&
      (newStatus === 'interested' || newStatus === 'confirmed' || newStatus === 'attended')
    ) {
      const { error: invErr } = await supabase
        .from('event_invitations')
        .update({ status: 'accepted' })
        .eq('id', pendingInvite.id);
      if (invErr) {
        console.warn('[event] auto-accept invitation after RSVP failed:', invErr.message);
      } else {
        setPendingInvite(null);
      }
    }
    // Refresh counts from event_statuses (source of truth).
    const { data: refreshed } = await supabase
      .from('event_statuses')
      .select('status')
      .eq('event_id', event.id)
      .in('status', ['interested', 'confirmed']);
    setComputedCounts({
      interested: (refreshed ?? []).filter((s) => s.status === 'interested').length,
      confirmed: (refreshed ?? []).filter((s) => s.status === 'confirmed').length,
    });

    // For giveaways, reload entry count (server trigger handles entry creation)
    if (giveaway) {
      const { count } = await supabase
        .from('giveaway_entries')
        .select('id', { count: 'exact', head: true })
        .eq('giveaway_id', giveaway.id);
      setGiveawayEntryCount(count ?? 0);
    }
  }

  // ── Invitation decline ────────────────────────────────────────────
  // The "accept" path is no longer a separate function — clicking
  // Zusagen on a private event already calls updateStatus('confirmed')
  // which auto-accepts the pending invitation via the side-effect at
  // the bottom of updateStatus. Decline stays as its own function so
  // the Absagen button can call it cleanly.
  async function declineInvitation() {
    if (!user || !event || !pendingInvite || inviteBusy) return;
    setInviteBusy(true);
    try {
      const { error: invErr } = await supabase
        .from('event_invitations')
        .update({ status: 'declined' })
        .eq('id', pendingInvite.id);
      if (invErr) {
        alert(`Ablehnen fehlgeschlagen: ${invErr.message}`);
        return;
      }
      // Defensive: clear any prior event_status row so the user
      // doesn't show up as a participant after declining.
      await supabase
        .from('event_statuses')
        .delete()
        .eq('event_id', event.id)
        .eq('user_id', user.id);
      setPendingInvite(null);
      setStatus(null);
    } finally {
      setInviteBusy(false);
    }
  }

  // ── Feed post actions ────────────────────────────────────────────
  async function postFeedMessage() {
    if (!user || !event || !newPostText.trim() || postingFeed) return;
    setPostingFeed(true);
    const text = newPostText.trim();
    const { data, error } = await supabase
      .from('event_feed_posts')
      .insert({
        event_id: event.id,
        author_profile_id: user.id,
        content_type: 'text',
        text,
      })
      .select('*')
      .single();
    setPostingFeed(false);
    if (error || !data) return;
    setNewPostText('');
    setFeedPosts((prev) => [data as FeedPost, ...prev]);
    // Make sure we have author info for the new post
    if (!feedAuthors[user.id]) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .eq('id', user.id)
        .single();
      if (prof) setFeedAuthors((prev) => ({ ...prev, [user.id]: prof as AuthorInfo }));
    }
  }

  async function deleteFeedPost(postId: string) {
    if (!confirm('Beitrag löschen?')) return;
    const { error } = await supabase.from('event_feed_posts').delete().eq('id', postId);
    if (!error) {
      setFeedPosts((prev) => prev.filter((p) => p.id !== postId));
    }
  }

  // ── Derived state ────────────────────────────────────────────────
  const isOwnEvent = user && event && event.organizer_profile_id === user.id;
  const canPostFeed = Boolean(isOwnEvent);
  const isPast = useMemo(() => {
    if (!event) return false;
    return (event.end_date ?? event.date) < today;
  }, [event, today]);
  const isConfirmed = status === 'confirmed' || status === 'attended';

  // ── Render ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto animate-fade-in">
        <div className="h-64 rounded-2xl bg-muted animate-pulse mb-6" />
        <div className="space-y-4">
          <div className="h-8 w-2/3 bg-muted rounded animate-pulse" />
          <div className="h-5 w-1/3 bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20 animate-fade-in">
        <p className="text-base font-medium text-muted-fg">Event nicht gefunden</p>
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1 mt-3 text-[13px] font-medium hover:opacity-70 transition-opacity"
        >
          <ArrowLeft size={14} /> Zurück
        </button>
      </div>
    );
  }

  const catColor = getCategoryColor(event.category);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Back */}
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-fg hover:text-foreground transition-colors"
      >
        <ArrowLeft size={15} /> Zurück
      </button>

      {/* Cinematic hero — title + date imprinted on banner with a
          bottom gradient for legibility. Replaces the old separate
          "banner + h1 below" pair that felt disjointed. */}
      <div className="aspect-[191/100] rounded-3xl bg-muted overflow-hidden relative shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)]">
        <EventBanner event={event} />

        {/* Bottom gradient for text legibility */}
        <div className="absolute inset-x-0 bottom-0 h-[75%] bg-gradient-to-t from-black/85 via-black/45 to-transparent pointer-events-none" />

        {/* Top-right badges stacked: private, category, past */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 items-end">
          {event.visibility === 'private' && (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-amber-500/90 text-white backdrop-blur-md">
              <Lock size={10} strokeWidth={2.5} /> Privat
            </span>
          )}
          {event.category && event.category.trim() ? (
            <span
              className="inline-flex items-center px-3 py-1.5 rounded-full text-[11px] font-semibold text-white backdrop-blur-md"
              style={{ backgroundColor: `${catColor}e6` }}
            >
              {event.category}
            </span>
          ) : null}
          {isPast && (
            <span className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-black/70 text-white backdrop-blur-md">
              Vergangen
            </span>
          )}
        </div>

        {/* Title + date overlay */}
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 text-white">
          <div className="flex items-center gap-2 text-[11px] sm:text-[12px] font-medium uppercase tracking-[0.15em] text-white/85 mb-3">
            <Calendar size={12} strokeWidth={2} />
            <span>
              {formatDate(event.date)}
              {event.end_date && event.end_date !== event.date ? ` – ${formatDate(event.end_date)}` : ''}
            </span>
            <span className="opacity-50">·</span>
            <Clock size={12} strokeWidth={2} />
            <span>
              {formatTime(event.time)}
              {event.end_time ? ` – ${formatTime(event.end_time)}` : ''}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold tracking-tight leading-[1.05] drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
            {event.title}
          </h1>
          {event.slogan && (
            <p className="text-[14px] sm:text-[15px] text-white/80 italic mt-3 line-clamp-2 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)]">
              {event.slogan}
            </p>
          )}
        </div>
      </div>

      {/* Action row — flag / edit. The title used to share this row but
          now lives inside the hero, so the row only needs to carry
          controls. Right-aligned. */}
      <div className="space-y-3">
        {(user && (!isOwnEvent || isOwnEvent)) && (
          <div className="flex items-center justify-end gap-2">
            {!isOwnEvent && user && (
              <button
                onClick={() => setReportOpen(true)}
                className="p-2 rounded-full text-muted-fg hover:text-red-400 hover:bg-red-500/10 transition-colors"
                aria-label="Event melden"
                title="Event melden"
              >
                <Flag size={15} />
              </button>
            )}
            {isOwnEvent && event.visibility === 'private' && (
              <Link
                href={`/app/events/${event.id}/edit#invites`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors"
              >
                <Users size={13} strokeWidth={2} /> Freunde einladen
              </Link>
            )}
            {isOwnEvent && (
              <Link
                href={
                  event.visibility === 'private'
                    ? `/app/events/${event.id}/edit`
                    : `/organizer/events/${event.id}/edit`
                }
                className="px-3 py-1.5 rounded-full text-[12px] font-semibold border border-border-subtle hover:bg-elevated transition-colors"
              >
                Bearbeiten
              </Link>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-muted-fg">
          {/* Date + time already shown in the hero overlay above;
              only location / capacity live here now so the row
              doesn't duplicate what's visually right above it. */}
          {event.latitude != null && event.longitude != null ? (
            <Link
              href={`/app/map?lat=${event.latitude}&lng=${event.longitude}&event=${event.id}`}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors group"
              title="Auf der Karte anzeigen"
            >
              <MapPin size={14} strokeWidth={1.6} />
              <span className="underline decoration-dotted underline-offset-2 group-hover:decoration-solid">
                {event.location}
              </span>
            </Link>
          ) : (
            <span className="flex items-center gap-1.5">
              <MapPin size={14} strokeWidth={1.6} />
              {event.location}
            </span>
          )}
          {event.max_participants > 0 && (
            <span className="flex items-center gap-1.5">
              <Users size={14} strokeWidth={1.6} /> Max. {event.max_participants}
            </span>
          )}
        </div>

        {/* Counts — computed live from event_statuses (not the stale
            denormalized columns on events). */}
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5 text-sm">
            <Heart size={15} className="text-pink-500" />
            <span className="font-semibold">{computedCounts.interested}</span>
            <span className="text-muted-fg">interessiert</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <CheckCircle2 size={15} className="text-green-500" />
            <span className="font-semibold">{computedCounts.confirmed}</span>
            <span className="text-muted-fg">bestätigt</span>
          </div>
        </div>
      </div>

      {/* Friends going — mobile parity with the "Deine Freunde gehen hin"
          section on EventDetailsModal. Only shown on public events for
          non-organizers, and only when there's actually friend activity
          to display (empty-state is silent). */}
      {event.visibility === 'public' && !isOwnEvent && friendParticipants.length > 0 && (
        <FriendsGoingSection
          participants={friendParticipants}
          expanded={expandedFriendStatus}
          onToggle={(s) =>
            setExpandedFriendStatus((prev) => (prev === s ? null : s))
          }
        />
      )}

      {/* RSVP buttons — visibility-dependent layout
          • Private events: Zusagen + Absagen (no Interessiert — you're
            either coming to a friend's event or not). The pending
            invitation banner is intentionally NOT rendered separately
            because Zusagen here also accepts the invite, and Absagen
            here also declines it.
          • Public events: Interessiert + Zusagen + Speichern. */}
      {!isPast && user && !isOwnEvent && (
        event.visibility === 'private' ? (
          // Mobile parity: destructive action (Absagen) on the LEFT,
          // primary positive action (Zusagen) on the RIGHT. Same
          // convention iOS uses for confirmation alerts.
          <div className="flex gap-2 sm:gap-3">
            <button
              onClick={async () => {
                // Absagen: decline the invitation if there's a pending one,
                // and clear any RSVP status. Both paths together cover
                // "I was invited" and "I previously confirmed and now
                // changed my mind".
                if (pendingInvite) {
                  await declineInvitation();
                } else if (status) {
                  await updateStatus(status); // toggle off (delete row)
                }
              }}
              disabled={inviteBusy}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-semibold border border-border-subtle bg-surface text-foreground hover:border-red-500/40 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              <XIcon size={16} strokeWidth={2.2} />
              Absagen
            </button>
            <button
              onClick={() => updateStatus('confirmed')}
              disabled={inviteBusy}
              className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-semibold transition-all duration-200 disabled:opacity-50 ${
                status === 'confirmed' || status === 'attended'
                  ? 'bg-green-500 text-white shadow-sm'
                  : 'bg-violet-600 text-white hover:bg-violet-500 shadow-sm'
              }`}
            >
              {inviteBusy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} strokeWidth={2.2} />}
              {status === 'confirmed' || status === 'attended' ? 'Zugesagt' : 'Zusagen'}
            </button>
          </div>
        ) : (
          // Mobile parity: Interessiert oben (im Row mit Nicht-
          // Interessiert links, Interessiert rechts) + Zusagen unten
          // full-width. Web hat aktuell keine Nicht-Interessiert-
          // Option, daher Interessiert als einziges Element in der
          // oberen Reihe und Zusagen darunter.
          <div className="flex flex-col gap-2 sm:gap-3">
            <button
              onClick={() => updateStatus('interested')}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
                status === 'interested'
                  ? 'bg-pink-500 text-white shadow-sm'
                  : 'border border-border-subtle bg-surface text-foreground hover:border-border-strong'
              }`}
            >
              <Heart size={16} strokeWidth={status === 'interested' ? 2.5 : 1.8} />
              Interessiert
            </button>
            <button
              onClick={() => updateStatus('confirmed')}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
                status === 'confirmed' || status === 'attended'
                  ? 'bg-green-500 text-white shadow-sm'
                  : 'border border-border-subtle bg-surface text-foreground hover:border-border-strong'
              }`}
            >
              <CheckCircle2 size={16} strokeWidth={status === 'confirmed' ? 2.5 : 1.8} />
              Zusagen
            </button>
          </div>
        )
      )}

      {/* ─── GIVEAWAY ─────────────────────────────────────────────── */}
      {giveaway && (
        <GiveawaySection
          giveaway={giveaway}
          entryCount={giveawayEntryCount}
          winners={giveawayWinners}
          isConfirmed={isConfirmed}
          currentUserId={user?.id}
          isOrganizer={Boolean(isOwnEvent)}
        />
      )}

      {/* Description */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-5 sm:p-6">
        <h2 className="text-base font-heading font-semibold mb-3">Beschreibung</h2>
        <p className="text-sm leading-relaxed whitespace-pre-line">{event.description}</p>
      </div>

      {/* Links */}
      {(event.website || event.ticket_shop_url) && (
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {event.website && (
            <a
              href={event.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium border border-border-subtle bg-surface hover:bg-elevated/50 transition-all"
            >
              <Globe size={15} /> Website <ExternalLink size={12} className="text-muted-fg" />
            </a>
          )}
          {event.ticket_shop_url && (
            <a
              href={event.ticket_shop_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold bg-violet-600 text-white hover:bg-violet-500 transition"
            >
              <Ticket size={15} /> Tickets kaufen <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      {/* Organizer — clickable card opens the org profile preview when
          we have a real organizer_org_id (i.e. it's a verified org, not
          a private user-created event). */}
      {event.organizer_name && (
        event.organizer_org_id ? (
          <Link
            href={`/app/organizer/${event.organizer_org_id}`}
            className="block rounded-2xl border border-border-subtle bg-surface p-5 hover:border-violet-500/30 hover:bg-elevated/30 transition-colors"
          >
            <p className="text-[12px] text-muted-fg uppercase tracking-wide mb-2">Veranstalter</p>
            <p className="font-semibold">{event.organizer_name}</p>
            <p className="text-[11px] text-muted-fg mt-0.5">Antippen für Profil</p>
          </Link>
        ) : (
          <div className="rounded-2xl border border-border-subtle bg-surface p-5">
            <p className="text-[12px] text-muted-fg uppercase tracking-wide mb-2">Veranstalter</p>
            <p className="font-semibold">{event.organizer_name}</p>
          </div>
        )
      )}

      {/* ─── EVENT FEED ───────────────────────────────────────────── */}
      <EventFeedSection
        posts={feedPosts}
        authors={feedAuthors}
        canPost={canPostFeed}
        currentUserId={user?.id}
        newPostText={newPostText}
        onChangeText={setNewPostText}
        onPost={postFeedMessage}
        onDelete={deleteFeedPost}
        posting={postingFeed}
      />

      {/* Event chat link — deep-link into the specific room when we've
          been able to resolve it (RLS requires the user to be a
          participant). Fall back to the chat list only when resolution
          fails entirely, so the button still does something. */}
      {event.chat_enabled && (
        <Link
          href={eventChatRoomId ? `/app/chat/${eventChatRoomId}` : '/app/chat'}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-border-subtle bg-surface hover:bg-elevated/50 transition-colors text-[13px] font-semibold"
        >
          <MessageCircle size={15} /> Zum Event-Chat
        </Link>
      )}

      {/* Report modal */}
      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="event"
        targetId={event.id}
        targetName={event.title}
      />

    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Giveaway section
// ────────────────────────────────────────────────────────────────────

function GiveawaySection({
  giveaway, entryCount, winners, isConfirmed, currentUserId, isOrganizer,
}: {
  giveaway: Giveaway;
  entryCount: number;
  winners: GiveawayWinner[];
  isConfirmed: boolean;
  currentUserId?: string;
  isOrganizer: boolean;
}) {
  const drawDeadlinePassed = new Date(giveaway.draw_at) <= new Date();
  const isWinner = currentUserId
    ? winners.find((w) => w.user_id === currentUserId)
    : null;

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/[0.06] to-purple-500/[0.06] p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-violet-500/15 flex items-center justify-center flex-shrink-0">
          <Gift size={20} className="text-violet-400" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-heading font-bold">Gewinnspiel</h2>
          <p className="text-[13px] text-muted-fg">
            {giveaway.winner_count > 1 ? `${giveaway.winner_count} Gewinner` : '1 Gewinner'}
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-surface/60 border border-violet-500/15 p-4">
        <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-wider">Gewinn</p>
        <p className="text-[15px] font-semibold mt-1">{giveaway.prize_description}</p>
      </div>

      <div className="flex items-center justify-between text-[12px] text-muted-fg">
        <span className="flex items-center gap-1.5">
          <Users size={12} /> {entryCount} {entryCount === 1 ? 'Teilnehmer' : 'Teilnehmer'}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock size={12} />
          Ziehung am {new Date(giveaway.draw_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </span>
      </div>

      {/* Status / participation */}
      {!giveaway.drawn ? (
        <div className={`flex items-center justify-center gap-2 py-3 rounded-xl ${
          drawDeadlinePassed
            ? 'bg-amber-500/10 text-amber-400'
            : isConfirmed
              ? 'bg-green-500/10 text-green-400'
              : 'bg-elevated text-muted-fg'
        }`}>
          {drawDeadlinePassed ? (
            <>
              <Clock size={14} />
              <span className="text-[13px] font-semibold">Ziehung läuft</span>
            </>
          ) : isConfirmed ? (
            <>
              <CheckCircle2 size={14} />
              <span className="text-[13px] font-semibold">Du nimmst teil!</span>
            </>
          ) : (
            <>
              <Sparkles size={14} />
              <span className="text-[13px] font-semibold">Bestätige deine Teilnahme um teilzunehmen</span>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500/10 text-green-400">
            <Award size={14} />
            <span className="text-[13px] font-semibold">Gewinnspiel beendet</span>
          </div>
          {isWinner ? (
            <div className="rounded-xl bg-violet-500/10 border border-violet-500/30 p-4 text-center">
              <Trophy size={24} className="text-violet-400 mx-auto mb-2" />
              <p className="text-[14px] font-semibold text-violet-300">Du hast gewonnen! 🎉</p>
              <p className="text-[11px] text-muted-fg mt-1">Verifizierungs-Code:</p>
              <p className="text-[18px] font-mono font-bold text-violet-300 tracking-widest mt-1">
                {isWinner.verification_code}
              </p>
              <p className="text-[10px] text-muted-fg mt-2">
                Zeig diesen Code dem Veranstalter um deinen Gewinn abzuholen.
              </p>
            </div>
          ) : isOrganizer ? (
            <p className="text-[11px] text-muted-fg text-center">
              {winners.length} {winners.length === 1 ? 'Gewinner' : 'Gewinner'} wurden gezogen
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Event feed section
// ────────────────────────────────────────────────────────────────────

function EventFeedSection({
  posts, authors, canPost, currentUserId,
  newPostText, onChangeText, onPost, onDelete, posting,
}: {
  posts: FeedPost[];
  authors: Record<string, AuthorInfo>;
  canPost: boolean;
  currentUserId?: string;
  newPostText: string;
  onChangeText: (v: string) => void;
  onPost: () => void;
  onDelete: (postId: string) => void;
  posting: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface p-5 sm:p-6 space-y-4">
      <h2 className="text-base font-heading font-semibold">Event-Feed</h2>

      {/* Composer (only for the organizer) */}
      {canPost && (
        <div className="flex items-start gap-2">
          <textarea
            value={newPostText}
            onChange={(e) => onChangeText(e.target.value)}
            placeholder="Update für deine Teilnehmer schreiben…"
            rows={2}
            className="flex-1 px-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm resize-none focus:outline-none focus:border-violet-500/40"
          />
          <button
            onClick={onPost}
            disabled={!newPostText.trim() || posting}
            className="w-10 h-10 rounded-full bg-violet-600 text-white flex items-center justify-center hover:bg-violet-500 disabled:opacity-50 transition-colors flex-shrink-0"
            aria-label="Posten"
          >
            {posting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      )}

      {/* Posts list */}
      {posts.length === 0 ? (
        <div className="text-center py-8 text-muted-fg">
          <MessageCircle size={28} strokeWidth={1.4} className="mx-auto mb-2 opacity-40" />
          <p className="text-[13px] font-medium">
            {canPost ? 'Schreib das erste Update!' : 'Noch keine Posts in diesem Event.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const author = post.author_profile_id ? authors[post.author_profile_id] : null;
            const isOwnPost = post.author_profile_id === currentUserId;
            return (
              <div key={post.id} className="flex items-start gap-3 group">
                <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
                  {author?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={author.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-semibold text-foreground/70">
                      {(author?.full_name ?? '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0 rounded-xl bg-elevated/60 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-semibold truncate">
                      {author?.full_name ?? 'Veranstalter'}
                    </p>
                    <span className="text-[10px] text-muted-fg">{timeAgo(post.created_at)}</span>
                    {(isOwnPost || canPost) && (
                      <button
                        onClick={() => onDelete(post.id)}
                        className="ml-auto p-1 rounded text-muted-fg hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        aria-label="Löschen"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                  {post.text && (
                    <p className="text-[13px] mt-1 whitespace-pre-wrap break-words">{post.text}</p>
                  )}
                  {post.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.image_url} alt="" className="mt-2 max-w-[280px] rounded-lg" />
                  )}
                  {post.link_url && (
                    <a
                      href={post.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-violet-400 hover:underline"
                    >
                      <ExternalLink size={11} /> {post.link_title ?? post.link_url}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Jetzt';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Gestern';
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('de-DE');
}

function FriendsGoingSection({
  participants,
  expanded,
  onToggle,
}: {
  participants: FriendParticipant[];
  expanded: FriendParticipant['status'] | null;
  onToggle: (s: FriendParticipant['status']) => void;
}) {
  const byStatus: Record<FriendParticipant['status'], FriendParticipant[]> = {
    interested: participants.filter((p) => p.status === 'interested'),
    confirmed: participants.filter((p) => p.status === 'confirmed'),
    attended: participants.filter((p) => p.status === 'attended'),
  };

  // Display order mirrors the mobile app: confirmed (most committed)
  // first, then interested, then attended (only if non-empty).
  const statusOrder: Array<{
    key: FriendParticipant['status'];
    label: string;
    color: string;
    bg: string;
    icon: typeof Heart;
  }> = [
    { key: 'confirmed', label: 'dabei', color: 'text-green-500', bg: 'bg-green-500/10 hover:bg-green-500/15 border-green-500/20', icon: CheckCircle2 },
    { key: 'interested', label: 'interessiert', color: 'text-pink-500', bg: 'bg-pink-500/10 hover:bg-pink-500/15 border-pink-500/20', icon: Heart },
    { key: 'attended', label: 'waren da', color: 'text-violet-400', bg: 'bg-violet-500/10 hover:bg-violet-500/15 border-violet-500/20', icon: Trophy },
  ];

  // Avatar stack: up to 7 participants from the combined list, confirmed
  // first so the "most important" faces show up before interested-only.
  const stack = [...byStatus.confirmed, ...byStatus.interested, ...byStatus.attended].slice(0, 7);
  const overflow = participants.length - stack.length;

  const expandedList = expanded ? byStatus[expanded] : [];

  return (
    <section className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users size={15} className="text-violet-500" strokeWidth={2} />
        <h3 className="text-[13px] font-heading font-semibold">
          {participants.length === 1
            ? '1 Freund von dir'
            : `${participants.length} Freunde von dir`}
        </h3>
      </div>

      <div className="flex items-center -space-x-2">
        {stack.map((p) => (
          <FriendAvatar key={p.id} participant={p} />
        ))}
        {overflow > 0 && (
          <div className="w-9 h-9 rounded-full bg-elevated border-2 border-background flex items-center justify-center text-[11px] font-semibold text-muted-fg">
            +{overflow}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {statusOrder.map(({ key, label, color, bg, icon: Icon }) => {
          const list = byStatus[key];
          if (list.length === 0) return null;
          const isOpen = expanded === key;
          return (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${bg} ${
                isOpen ? 'ring-1 ring-foreground/20' : ''
              }`}
            >
              <Icon size={12} strokeWidth={2} className={color} />
              <span className="font-semibold">{list.length}</span>
              <span className="text-foreground/70">{label}</span>
            </button>
          );
        })}
      </div>

      {expanded && expandedList.length > 0 && (
        <ul className="pt-2 space-y-2 border-t border-border-subtle">
          {expandedList
            .slice()
            .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'de'))
            .map((p) => (
              <li key={p.id}>
                <Link
                  href={p.username ? `/app/profile/${p.username}` : `/app/profile/${p.id}`}
                  className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-elevated transition-colors"
                >
                  <FriendAvatar participant={p} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">
                      {p.full_name ?? p.username ?? 'Unbekannt'}
                    </p>
                    {p.username && p.full_name && (
                      <p className="text-[11.5px] text-muted-fg truncate">@{p.username}</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

function FriendAvatar({
  participant,
  size = 'md',
}: {
  participant: FriendParticipant;
  size?: 'sm' | 'md';
}) {
  const dim = size === 'sm' ? 'w-8 h-8' : 'w-9 h-9';
  const fontSize = size === 'sm' ? 'text-[11px]' : 'text-[12px]';
  const initial = (participant.full_name ?? participant.username ?? '?')
    .trim()
    .charAt(0)
    .toUpperCase();
  return participant.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={participant.avatar_url}
      alt={participant.full_name ?? ''}
      className={`${dim} rounded-full object-cover border-2 border-background`}
    />
  ) : (
    <div
      className={`${dim} rounded-full bg-elevated border-2 border-background flex items-center justify-center font-semibold ${fontSize} text-foreground/70`}
    >
      {initial}
    </div>
  );
}
