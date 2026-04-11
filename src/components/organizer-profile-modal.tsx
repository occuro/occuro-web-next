'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import {
  X, MapPin, Tag, BadgeCheck, Users, CalendarDays, ImageOff,
  Loader2, UserCheck, UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import type { Event } from '@/types/occuro';

interface OrgLite {
  id: string;
  name: string;
  avatar_url: string | null;
}

interface OrgFull extends OrgLite {
  bio: string | null;
  location: string | null;
  category: string | null;
  verified: boolean;
  follower_count: number;
}

interface OrganizerProfileModalProps {
  org: OrgLite;
  onClose: () => void;
}

/**
 * Lightweight web counterpart to the mobile org profile preview.
 *
 * Opens as a centred overlay when the user taps an organizer card or
 * the organizer name on an event. Lazy-loads bio, category, follower
 * count, verification, and a list of upcoming public events. Lets
 * the user follow/unfollow inline so the rest of their feed reflects
 * the choice immediately.
 */
export function OrganizerProfileModal({ org, onClose }: OrganizerProfileModalProps) {
  const { user } = useAuth();
  const supabase = createClient();
  const [profile, setProfile] = useState<OrgFull | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  // ── Lazy-load full org row + their public upcoming events ──────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const today = new Date().toISOString().split('T')[0];

    (async () => {
      const [orgRes, eventsRes, followRes] = await Promise.all([
        supabase
          .from('organizations')
          .select('id, name, avatar_url, bio, location, category, verified, follower_count')
          .eq('id', org.id)
          .maybeSingle(),
        supabase
          .from('events')
          .select('*')
          .eq('organizer_org_id', org.id)
          .eq('visibility', 'public')
          .gte('date', today)
          .order('date', { ascending: true })
          .limit(8),
        // Is the current user already following this org?
        user
          ? supabase
              .from('organizer_follows')
              .select('id')
              .eq('follower_id', user.id)
              .eq('organizer_org_id', org.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (cancelled) return;

      setProfile((orgRes.data as OrgFull) ?? {
        ...org,
        bio: null, location: null, category: null,
        verified: false, follower_count: 0,
      });
      setEvents((eventsRes.data ?? []) as Event[]);
      setFollowing(Boolean(followRes.data));
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [org.id, user, supabase, org]);

  // ── ESC + scroll lock ──────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // ── Follow / unfollow ──────────────────────────────────────────────
  async function toggleFollow() {
    if (!user || followBusy) return;
    setFollowBusy(true);
    if (following) {
      await supabase
        .from('organizer_follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('organizer_org_id', org.id);
      setFollowing(false);
      setProfile((p) => p ? { ...p, follower_count: Math.max(0, p.follower_count - 1) } : p);
    } else {
      await supabase.from('organizer_follows').insert({
        follower_id: user.id,
        organizer_org_id: org.id,
      });
      setFollowing(true);
      setProfile((p) => p ? { ...p, follower_count: p.follower_count + 1 } : p);
    }
    setFollowBusy(false);
  }

  const displayName = profile?.name ?? org.name;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-0 sm:p-4">
      <button
        type="button"
        aria-label="Schließen"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative w-full sm:max-w-lg bg-surface rounded-t-3xl sm:rounded-3xl border border-border-subtle max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden animate-fade-in">
        {/* Compact header — avatar + name + stats on one row */}
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
            <div className="flex items-center gap-1.5">
              <h2 className="text-lg font-heading font-bold truncate">{displayName}</h2>
              {profile?.verified && (
                <BadgeCheck size={16} className="text-violet-500 flex-shrink-0" strokeWidth={2.2} />
              )}
            </div>
            {profile?.category && (
              <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-foreground/70">
                <Tag size={9} /> {profile.category}
              </span>
            )}
            {!loading && (
              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-fg">
                <span className="flex items-center gap-1">
                  <Users size={11} className="text-violet-400" />
                  <span className="font-semibold text-foreground">{profile?.follower_count ?? 0}</span> Follower
                </span>
                <span className="flex items-center gap-1">
                  <CalendarDays size={11} className="text-violet-400" />
                  <span className="font-semibold text-foreground">{events.length}</span> Events
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

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 pt-1 pb-5">
          {profile?.bio && (
            <p className="text-[13px] leading-relaxed text-foreground/90">{profile.bio}</p>
          )}

          {profile?.location && (
            <div className="flex items-center gap-1.5 text-[12px] text-muted-fg mt-2">
              <MapPin size={12} />{profile.location}
            </div>
          )}

          {/* Upcoming events */}
          <div className="mt-4">
            <h3 className="text-[11px] font-semibold text-muted-fg uppercase tracking-wider mb-2">
              Anstehende Events
            </h3>
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 size={18} className="animate-spin text-muted-fg" />
              </div>
            ) : events.length === 0 ? (
              <p className="text-[12px] text-muted-fg text-center py-4 italic">
                Aktuell keine angekündigten Events.
              </p>
            ) : (
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
                      <p className="text-[13px] font-semibold truncate">{event.title}</p>
                      <p className="text-[11px] text-muted-fg truncate">
                        {formatDate(event.date)} · {event.location}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action bar — Follow toggle */}
        {user && (
          <div className="px-5 py-3 border-t border-border-subtle bg-surface flex-shrink-0">
            <button
              type="button"
              onClick={toggleFollow}
              disabled={followBusy}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-colors disabled:opacity-50 ${
                following
                  ? 'border border-border-subtle text-foreground hover:bg-elevated'
                  : 'bg-violet-600 text-white hover:bg-violet-500'
              }`}
            >
              {followBusy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : following ? (
                <UserCheck size={14} />
              ) : (
                <UserPlus size={14} />
              )}
              {following ? 'Folgst du' : 'Folgen'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
