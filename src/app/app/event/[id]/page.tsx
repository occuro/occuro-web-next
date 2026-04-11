'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Event } from '@/types/occuro';
import { formatDate, formatTime, getCategoryColor } from '@/lib/utils';
import Link from 'next/link';
import {
  ArrowLeft, Calendar, Clock, MapPin, Heart, CheckCircle2,
  Users, Globe, Ticket, ImageOff, ExternalLink, Lock,
  Gift, Award, Sparkles, Loader2, MessageCircle, Send,
  Trophy, Trash2, Flag, Mail, X as XIcon,
} from 'lucide-react';
import { ReportModal } from '@/components/report-modal';
import { OrganizerProfileModal } from '@/components/organizer-profile-modal';

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

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useAuth();
  const supabase = createClient();

  const [event, setEvent] = useState<Event | null>(null);
  const [status, setStatus] = useState<UserStatus>(null);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [orgPreviewOpen, setOrgPreviewOpen] = useState(false);
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
      setEvent(null);
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
    // Refresh counts
    const { data } = await supabase
      .from('events')
      .select('interested_count, confirmed_count')
      .eq('id', event.id)
      .single();
    if (data) setEvent((prev) => prev ? { ...prev, ...data } : prev);

    // For giveaways, reload entry count (server trigger handles entry creation)
    if (giveaway) {
      const { count } = await supabase
        .from('giveaway_entries')
        .select('id', { count: 'exact', head: true })
        .eq('giveaway_id', giveaway.id);
      setGiveawayEntryCount(count ?? 0);
    }
  }

  // ── Invitation accept / decline ──────────────────────────────────
  // Mirrors the mobile app's useInvitations.acceptInvitation /
  // declineInvitation: accepting writes status='accepted' on the
  // invitation row AND upserts an event_status='confirmed' (which the
  // DB trigger uses to add the user to the event chat). Declining
  // writes status='declined' and clears any existing event_status row
  // so the user vanishes from participation lists.
  async function acceptInvitation() {
    if (!user || !event || !pendingInvite || inviteBusy) return;
    setInviteBusy(true);
    try {
      const { error: invErr } = await supabase
        .from('event_invitations')
        .update({ status: 'accepted' })
        .eq('id', pendingInvite.id);
      if (invErr) {
        alert(`Annehmen fehlgeschlagen: ${invErr.message}`);
        return;
      }
      const { error: statusErr } = await supabase
        .from('event_statuses')
        .upsert(
          { event_id: event.id, user_id: user.id, status: 'confirmed' },
          { onConflict: 'event_id,user_id' },
        );
      if (statusErr) {
        console.warn('[event] event_statuses upsert after accept failed:', statusErr.message);
      }
      setPendingInvite(null);
      setStatus('confirmed');
      // Refresh counts
      const { data } = await supabase
        .from('events')
        .select('interested_count, confirmed_count')
        .eq('id', event.id)
        .single();
      if (data) setEvent((prev) => prev ? { ...prev, ...data } : prev);
    } finally {
      setInviteBusy(false);
    }
  }

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
        <Link href="/app" className="inline-flex items-center gap-1 mt-3 text-[13px] font-medium hover:opacity-70 transition-opacity">
          <ArrowLeft size={14} /> Zurück
        </Link>
      </div>
    );
  }

  const catColor = getCategoryColor(event.category);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Back */}
      <Link
        href="/app"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-fg hover:text-foreground transition-colors"
      >
        <ArrowLeft size={15} /> Zurück
      </Link>

      {/* Banner */}
      <div className="aspect-[21/9] rounded-2xl bg-muted overflow-hidden relative">
        {event.banner_url || event.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.banner_url ?? event.image_url ?? ''} alt={event.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-elevated/50">
            <ImageOff size={48} strokeWidth={1} className="text-muted-fg/20" />
          </div>
        )}
        <div className="absolute top-3 sm:top-4 left-3 sm:left-4 flex flex-col gap-2">
          <span
            className="inline-flex items-center px-3 py-1.5 rounded-full text-[11px] sm:text-[12px] font-semibold text-white backdrop-blur-sm"
            style={{ backgroundColor: `${catColor}dd` }}
          >
            {event.category}
          </span>
          {event.visibility === 'private' && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium bg-amber-500/90 text-white">
              <Lock size={10} /> Privat
            </span>
          )}
        </div>
        {isPast && (
          <span className="absolute top-3 sm:top-4 right-3 sm:right-4 px-3 py-1.5 rounded-full text-[11px] sm:text-[12px] font-semibold bg-black/60 text-white backdrop-blur-sm">
            Vergangen
          </span>
        )}
      </div>

      {/* Title + meta */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">{event.title}</h1>
            {event.slogan && <p className="text-muted-fg mt-1">{event.slogan}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
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
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-muted-fg">
          <span className="flex items-center gap-1.5">
            <Calendar size={14} strokeWidth={1.6} />
            {formatDate(event.date)}
            {event.end_date && event.end_date !== event.date && ` – ${formatDate(event.end_date)}`}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={14} strokeWidth={1.6} />
            {formatTime(event.time)}
            {event.end_time && ` – ${formatTime(event.end_time)}`}
          </span>
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

        {/* Counts */}
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5 text-sm">
            <Heart size={15} className="text-pink-500" />
            <span className="font-semibold">{event.interested_count}</span>
            <span className="text-muted-fg">interessiert</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <CheckCircle2 size={15} className="text-green-500" />
            <span className="font-semibold">{event.confirmed_count}</span>
            <span className="text-muted-fg">bestätigt</span>
          </div>
        </div>
      </div>

      {/* Pending invitation banner — shows when the current user has a
          pending event_invitation row for this event. Mirrors the
          mobile app's accept/decline CTA. */}
      {pendingInvite && !isPast && (
        <div className="rounded-2xl border border-violet-500/30 bg-violet-500/[0.06] p-4 sm:p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center flex-shrink-0">
            <Mail size={18} className="text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold">Du wurdest zu diesem Event eingeladen</p>
            <p className="text-[12px] text-muted-fg mt-0.5">
              Sag zu oder lehne ab. Beim Annehmen kommst du automatisch in den Event-Chat.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={acceptInvitation}
                disabled={inviteBusy}
                className="px-4 py-2 rounded-full text-[12px] font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {inviteBusy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                Annehmen
              </button>
              <button
                onClick={declineInvitation}
                disabled={inviteBusy}
                className="px-4 py-2 rounded-full text-[12px] font-semibold border border-border-subtle hover:bg-elevated transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <XIcon size={12} />
                Ablehnen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RSVP buttons */}
      {!isPast && user && !isOwnEvent && (
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button
            onClick={() => updateStatus('interested')}
            className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
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
            className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
              status === 'confirmed' || status === 'attended'
                ? 'bg-green-500 text-white shadow-sm'
                : 'border border-border-subtle bg-surface text-foreground hover:border-border-strong'
            }`}
          >
            <CheckCircle2 size={16} strokeWidth={status === 'confirmed' ? 2.5 : 1.8} />
            Zusagen
          </button>
          <button
            onClick={() => updateStatus('saved')}
            className={`py-3 px-4 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
              status === 'saved'
                ? 'bg-violet-500 text-white shadow-sm'
                : 'border border-border-subtle bg-surface text-foreground hover:border-border-strong'
            }`}
          >
            Speichern
          </button>
        </div>
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
          <button
            type="button"
            onClick={() => setOrgPreviewOpen(true)}
            className="w-full text-left rounded-2xl border border-border-subtle bg-surface p-5 hover:border-violet-500/30 hover:bg-elevated/30 transition-colors"
          >
            <p className="text-[12px] text-muted-fg uppercase tracking-wide mb-2">Veranstalter</p>
            <p className="font-semibold">{event.organizer_name}</p>
            <p className="text-[11px] text-muted-fg mt-0.5">Antippen für Profil</p>
          </button>
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

      {/* Event chat link */}
      {event.chat_enabled && (
        <Link
          href="/app/chat"
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

      {/* Organizer profile preview */}
      {orgPreviewOpen && event.organizer_org_id && (
        <OrganizerProfileModal
          org={{
            id: event.organizer_org_id,
            name: event.organizer_name ?? 'Veranstalter',
            avatar_url: null,
          }}
          onClose={() => setOrgPreviewOpen(false)}
        />
      )}
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
