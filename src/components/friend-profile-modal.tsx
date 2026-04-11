'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import {
  X, MapPin, Globe, AtSign, Users, CalendarDays, MessageCircle,
  UserMinus, Loader2, Heart, ImageOff, Lock,
} from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import type { Event } from '@/types/occuro';

interface FriendProfileLite {
  id: string;
  full_name: string;
  username: string | null;
  avatar_url: string | null;
}

interface FriendProfileFull extends FriendProfileLite {
  bio: string | null;
  location: string | null;
  banner_url: string | null;
  website: string | null;
  instagram: string | null;
  interests: string[] | null;
}

interface FriendProfileModalProps {
  friend: FriendProfileLite;
  /** Whether this person is currently a friend (controls Remove button). */
  isFriend?: boolean;
  /** Triggered when the user removes this friend. Modal will auto-close. */
  onRemoveFriend?: (friendId: string) => Promise<void> | void;
  onClose: () => void;
}

type EventGroup = 'hosting' | 'attending';

/**
 * Lightweight web counterpart to the mobile FriendProfileModal.
 *
 * Opens as a centred overlay when the user taps a friend row. Lazy-loads
 * the full profile (bio, location, interests, banner) plus a preview of
 * the friend's upcoming public events. Designed for read-mostly contexts:
 * the user can message, remove, or jump to the full profile from here.
 */
export function FriendProfileModal({ friend, isFriend, onRemoveFriend, onClose }: FriendProfileModalProps) {
  const { user } = useAuth();
  const supabase = createClient();
  const [profile, setProfile] = useState<FriendProfileFull | null>(null);
  const [hostedEvents, setHostedEvents] = useState<Event[]>([]);
  const [attendingEvents, setAttendingEvents] = useState<Event[]>([]);
  const [friendCount, setFriendCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [eventGroup, setEventGroup] = useState<EventGroup>('attending');

  // ── Lazy-load full profile + their public upcoming events ───────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const today = new Date().toISOString().split('T')[0];

    (async () => {
      const [profileRes, hostedRes, statusesRes, friendsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, username, avatar_url, bio, location, banner_url, website, instagram, interests')
          .eq('id', friend.id)
          .maybeSingle(),
        // Public events that this user is HOSTING (organizer of)
        supabase
          .from('events')
          .select('*')
          .eq('organizer_profile_id', friend.id)
          .eq('visibility', 'public')
          .gte('date', today)
          .order('date', { ascending: true })
          .limit(8),
        // Public events this user is INTERESTED IN or CONFIRMED for —
        // we look up event_statuses then resolve the actual events.
        supabase
          .from('event_statuses')
          .select('event_id, status')
          .eq('user_id', friend.id)
          .in('status', ['interested', 'confirmed', 'attended']),
        // Friend count for the friend (distinct relationships)
        supabase
          .from('friendships')
          .select('user_id, friend_id, status')
          .or(`user_id.eq.${friend.id},friend_id.eq.${friend.id}`)
          .eq('status', 'accepted'),
      ]);

      if (cancelled) return;

      setProfile((profileRes.data as FriendProfileFull) ?? {
        ...friend,
        bio: null, location: null, banner_url: null,
        website: null, instagram: null, interests: null,
      });
      setHostedEvents((hostedRes.data ?? []) as Event[]);

      // Resolve attending event ids → full event rows (public + upcoming)
      const eventIds = ((statusesRes.data ?? []) as Array<{ event_id: string }>).map((s) => s.event_id);
      if (eventIds.length > 0) {
        const { data: attendingData } = await supabase
          .from('events')
          .select('*')
          .in('id', eventIds)
          .eq('visibility', 'public')
          .gte('date', today)
          .order('date', { ascending: true })
          .limit(8);
        if (!cancelled) setAttendingEvents((attendingData ?? []) as Event[]);
      } else if (!cancelled) {
        setAttendingEvents([]);
      }

      // Dedupe friend count by counting distinct other-side ids
      const ids = new Set<string>();
      ((friendsRes.data ?? []) as Array<{ user_id: string; friend_id: string }>).forEach((f) => {
        const other = f.user_id === friend.id ? f.friend_id : f.user_id;
        if (other) ids.add(other);
      });
      setFriendCount(ids.size);

      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [friend.id, supabase, friend]);

  // ── ESC to close ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  async function handleRemove() {
    if (!onRemoveFriend) return;
    setRemoving(true);
    try {
      await onRemoveFriend(friend.id);
      onClose();
    } finally {
      setRemoving(false);
    }
  }

  const isSelf = user?.id === friend.id;
  const displayName = profile?.full_name ?? friend.full_name;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-0 sm:p-4">
      {/* Backdrop click to close */}
      <button
        type="button"
        aria-label="Schließen"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative w-full sm:max-w-lg bg-surface rounded-t-3xl sm:rounded-3xl border border-border-subtle max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden animate-fade-in">
        {/* ── Compact header: avatar + identity on a single row ──
            No more centered avatar with mountain of whitespace beneath
            it — push the identity left, the close button right, and the
            event list visible immediately. */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-3 flex-shrink-0">
          <div className="w-16 h-16 rounded-full bg-elevated ring-2 ring-border-subtle flex items-center justify-center text-xl font-bold overflow-hidden flex-shrink-0">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-muted-fg">{initial}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-heading font-bold truncate">{displayName}</h2>
            {profile?.username && (
              <p className="text-[12px] text-muted-fg truncate">@{profile.username}</p>
            )}
            {/* Stats inline under the name */}
            {!loading && (
              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-fg">
                <span className="flex items-center gap-1">
                  <Users size={11} className="text-violet-400" />
                  <span className="font-semibold text-foreground">{friendCount}</span> Freunde
                </span>
                <span className="flex items-center gap-1">
                  <CalendarDays size={11} className="text-violet-400" />
                  <span className="font-semibold text-foreground">{hostedEvents.length + attendingEvents.length}</span> Events
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-elevated transition-colors flex items-center justify-center flex-shrink-0"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto px-5 pt-1 pb-5">
          {/* Bio */}
          {profile?.bio && (
            <p className="text-[13px] leading-relaxed text-foreground/90">{profile.bio}</p>
          )}

          {/* Location / Web / Insta row */}
          {(profile?.location || profile?.website || profile?.instagram) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-fg mt-2">
              {profile?.location && (
                <span className="flex items-center gap-1.5"><MapPin size={12} />{profile.location}</span>
              )}
              {profile?.website && (
                <a
                  href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                >
                  <Globe size={12} />{profile.website.replace(/^https?:\/\//, '')}
                </a>
              )}
              {profile?.instagram && (
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
          {profile?.interests && profile.interests.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-3">
              {profile.interests.slice(0, 8).map((interest) => (
                <span key={interest} className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-muted text-foreground/70">
                  {interest}
                </span>
              ))}
            </div>
          )}

          {/* Event tabs — visible immediately, no scrolling needed */}
          {!loading && (hostedEvents.length > 0 || attendingEvents.length > 0) && (
            <div className="mt-4">
              <div className="flex rounded-xl bg-muted p-1 mb-2.5">
                <button
                  type="button"
                  onClick={() => setEventGroup('attending')}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
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
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    eventGroup === 'hosting'
                      ? 'bg-surface text-foreground shadow-sm'
                      : 'text-muted-fg hover:text-foreground'
                  }`}
                >
                  Eigene ({hostedEvents.length})
                </button>
              </div>

              <EventList
                events={eventGroup === 'attending' ? attendingEvents : hostedEvents}
                onClose={onClose}
                emptyText={
                  eventGroup === 'attending'
                    ? 'Aktuell keine geplanten Teilnahmen.'
                    : 'Hostet aktuell keine eigenen Events.'
                }
              />
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin text-muted-fg" />
            </div>
          )}
        </div>

        {/* ── Action bar ── */}
        {!isSelf && (
          <div className="px-5 py-3 border-t border-border-subtle flex gap-2 bg-surface flex-shrink-0">
            <Link
              href={`/app/chat?with=${friend.id}`}
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-[13px] font-semibold hover:bg-violet-500 transition-colors"
            >
              <MessageCircle size={14} /> Nachricht
            </Link>
            {isFriend && onRemoveFriend && (
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-border-subtle text-[13px] font-medium text-muted-fg hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5 transition-colors disabled:opacity-50"
              >
                {removing ? <Loader2 size={13} className="animate-spin" /> : <UserMinus size={13} />}
                Entfernen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Helper: list of event rows used by the Teilnahmen / Eigene tabs.
// Kept inline because it's only used here and tightly coupled to the
// modal's compact styling.
// ────────────────────────────────────────────────────────────────────

function EventList({
  events, onClose, emptyText,
}: {
  events: Event[];
  onClose: () => void;
  emptyText: string;
}) {
  if (events.length === 0) {
    return (
      <p className="text-[12px] text-muted-fg text-center py-6 italic">{emptyText}</p>
    );
  }
  return (
    <div className="space-y-2">
      {events.map((event) => (
        <Link
          key={event.id}
          href={`/app/event/${event.id}`}
          onClick={onClose}
          className="flex items-center gap-3 p-2.5 rounded-xl border border-border-subtle bg-elevated/30 hover:bg-elevated transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden flex-shrink-0">
            {event.banner_url || event.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.banner_url ?? event.image_url ?? ''} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageOff size={12} className="text-muted-fg/30" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold truncate flex items-center gap-1.5">
              {event.visibility === 'private' && <Lock size={10} className="text-muted-fg" />}
              {event.title}
            </p>
            <p className="text-[11px] text-muted-fg truncate">
              {formatDate(event.date)} · {event.location}
            </p>
          </div>
          <Heart size={11} className="text-muted-fg/40 flex-shrink-0" />
        </Link>
      ))}
    </div>
  );
}
