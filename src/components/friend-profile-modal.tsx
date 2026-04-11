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
  const [events, setEvents] = useState<Event[]>([]);
  const [friendCount, setFriendCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);

  // ── Lazy-load full profile + their public upcoming events ───────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const today = new Date().toISOString().split('T')[0];

    (async () => {
      const [profileRes, eventsRes, friendsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, username, avatar_url, bio, location, banner_url, website, instagram, interests')
          .eq('id', friend.id)
          .maybeSingle(),
        // Their public events the user is interested in or hosting
        supabase
          .from('events')
          .select('*')
          .eq('organizer_profile_id', friend.id)
          .eq('visibility', 'public')
          .gte('date', today)
          .order('date', { ascending: true })
          .limit(5),
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
      setEvents((eventsRes.data ?? []) as Event[]);

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
        {/* ── Banner ── */}
        <div className="h-32 bg-gradient-to-br from-violet-500/20 to-purple-600/20 relative flex-shrink-0">
          {profile?.banner_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.banner_url} alt="" className="w-full h-full object-cover" />
          )}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur text-white hover:bg-black/60 transition-colors flex items-center justify-center"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {/* Avatar overlapping the banner */}
          <div className="w-20 h-20 rounded-full bg-elevated border-4 border-surface -mt-10 relative z-10 flex items-center justify-center text-xl font-bold overflow-hidden">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-muted-fg">{initial}</span>
            )}
          </div>

          {/* Identity */}
          <div className="mt-3 space-y-2">
            <div>
              <h2 className="text-xl font-heading font-bold">{displayName}</h2>
              {profile?.username && (
                <p className="text-[13px] text-muted-fg">@{profile.username}</p>
              )}
            </div>

            {profile?.bio && (
              <p className="text-sm leading-relaxed text-foreground/90">{profile.bio}</p>
            )}

            {/* Location / Web / Insta row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-fg pt-1">
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

            {/* Stats */}
            {!loading && (
              <div className="flex items-center gap-2 pt-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-elevated border border-border-subtle">
                  <Users size={12} className="text-violet-400" />
                  <span className="text-[12px] font-semibold">{friendCount}</span>
                  <span className="text-[11px] text-muted-fg">Freunde</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-elevated border border-border-subtle">
                  <CalendarDays size={12} className="text-violet-400" />
                  <span className="text-[12px] font-semibold">{events.length}</span>
                  <span className="text-[11px] text-muted-fg">Events</span>
                </div>
              </div>
            )}

            {/* Interests */}
            {profile?.interests && profile.interests.length > 0 && (
              <div className="flex gap-1.5 flex-wrap pt-2">
                {profile.interests.slice(0, 8).map((interest) => (
                  <span key={interest} className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-muted text-foreground/70">
                    {interest}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Their upcoming events */}
          {!loading && events.length > 0 && (
            <div className="mt-5">
              <h3 className="text-[11px] font-semibold text-muted-fg uppercase tracking-wider mb-2">
                Anstehende Events
              </h3>
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
