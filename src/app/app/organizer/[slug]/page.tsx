'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/utils';
import type { Event } from '@/types/occuro';
import {
  ArrowLeft, MapPin, Tag, BadgeCheck, Users, CalendarDays,
  ImageOff, Loader2, UserCheck, UserPlus,
} from 'lucide-react';

interface FullOrg {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  category: string | null;
  verified: boolean;
  follower_count: number;
}

/**
 * Public organizer profile page at /app/organizer/[slug] where slug is
 * the org id. Same dedicated-page pattern as /app/profile/[slug] for
 * individuals — replaces the OrganizerProfileModal that had the same
 * scroll-bleed-through and shareability problems.
 */
export default function PublicOrganizerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [org, setOrg] = useState<FullOrg | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    console.info(`[org-profile] resolving slug=${slug}`);

    const { data: orgData, error: orgErr } = await supabase
      .from('organizations')
      .select('id, name, avatar_url, bio, location, category, verified, follower_count')
      .eq('id', slug)
      .maybeSingle();
    if (orgErr) console.warn('[org-profile] org lookup failed:', orgErr.message);
    if (!orgData) {
      setOrg(null);
      setLoading(false);
      return;
    }
    setOrg(orgData as FullOrg);

    const today = new Date().toISOString().split('T')[0];
    const [eventsRes, followRes] = await Promise.all([
      supabase
        .from('events')
        .select('*')
        .eq('organizer_org_id', slug)
        .eq('visibility', 'public')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(20),
      user
        ? supabase
            .from('organizer_follows')
            .select('id')
            .eq('follower_id', user.id)
            .eq('organizer_org_id', slug)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    setEvents((eventsRes.data ?? []) as Event[]);
    setFollowing(Boolean(followRes.data));
    setLoading(false);
  }, [slug, user, supabase]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  // ── Follow / unfollow ────────────────────────────────────────────
  async function toggleFollow() {
    if (!user || !org || followBusy) return;
    setFollowBusy(true);
    if (following) {
      await supabase
        .from('organizer_follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('organizer_org_id', org.id);
      setFollowing(false);
      setOrg((prev) => prev ? { ...prev, follower_count: Math.max(0, prev.follower_count - 1) } : prev);
    } else {
      await supabase.from('organizer_follows').insert({
        follower_id: user.id,
        organizer_org_id: org.id,
      });
      setFollowing(true);
      setOrg((prev) => prev ? { ...prev, follower_count: prev.follower_count + 1 } : prev);
    }
    setFollowBusy(false);
  }

  if (loading || authLoading) {
    return (
      <div className="max-w-3xl mx-auto py-20 flex justify-center">
        <Loader2 size={24} className="animate-spin text-muted-fg" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center text-muted-fg">
        <p className="text-sm font-medium">Veranstalter nicht gefunden</p>
        <Link href="/app/friends" className="inline-flex items-center gap-1 mt-3 text-[13px] text-violet-400 hover:text-violet-300">
          <ArrowLeft size={13} /> Zurück
        </Link>
      </div>
    );
  }

  const initial = org.name.charAt(0).toUpperCase();

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-fg hover:text-foreground transition-colors"
      >
        <ArrowLeft size={15} /> Zurück
      </button>

      <div className="rounded-2xl border border-border-subtle bg-surface overflow-hidden">
        <div className="h-32 sm:h-40 bg-gradient-to-br from-violet-500/15 to-purple-600/15" />

        <div className="px-6 pt-5 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-elevated ring-2 ring-border-subtle flex items-center justify-center text-2xl font-bold overflow-hidden flex-shrink-0">
              {org.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={org.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-muted-fg">{initial}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-xl sm:text-2xl font-heading font-bold truncate">{org.name}</h1>
                {org.verified && (
                  <BadgeCheck size={18} className="text-violet-500 flex-shrink-0" strokeWidth={2.2} />
                )}
              </div>
              {org.category && (
                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-foreground/70">
                  <Tag size={10} /> {org.category}
                </span>
              )}
            </div>
          </div>

          {org.bio && (
            <p className="text-[14px] leading-relaxed mt-4">{org.bio}</p>
          )}

          {/* Stats */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-elevated border border-border-subtle">
              <Users size={13} className="text-violet-400" />
              <span className="text-[13px] font-semibold">{org.follower_count}</span>
              <span className="text-[12px] text-muted-fg">Follower</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-elevated border border-border-subtle">
              <CalendarDays size={13} className="text-violet-400" />
              <span className="text-[13px] font-semibold">{events.length}</span>
              <span className="text-[12px] text-muted-fg">Anstehend</span>
            </div>
          </div>

          {org.location && (
            <div className="flex items-center gap-1.5 text-[12px] text-muted-fg mt-3">
              <MapPin size={12} />{org.location}
            </div>
          )}

          {/* Follow button */}
          {user && (
            <div className="mt-5">
              <button
                type="button"
                onClick={toggleFollow}
                disabled={followBusy}
                className={`w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-colors disabled:opacity-50 ${
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

      {/* Upcoming events */}
      <div>
        <h2 className="text-[11px] font-semibold text-muted-fg uppercase tracking-wider mb-3">
          Anstehende Events
        </h2>
        {events.length === 0 ? (
          <p className="text-[13px] text-muted-fg italic py-6 text-center rounded-2xl border border-dashed border-border-subtle bg-surface">
            Aktuell keine angekündigten Events.
          </p>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
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
                  <p className="text-[14px] font-semibold truncate">{event.title}</p>
                  <p className="text-[12px] text-muted-fg truncate">
                    {formatDate(event.date)} · {event.location}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
