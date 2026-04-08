'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Event } from '@/types/occuro';
import { formatDate, formatTime, getCategoryColor } from '@/lib/utils';
import Link from 'next/link';
import {
  MapPin, Globe, AtSign, Settings, Bell, Heart, CheckCircle2,
  Bookmark, Calendar, Clock, ImageOff, Users, Lock, Eye,
} from 'lucide-react';

type EventTab = 'interested' | 'confirmed' | 'past' | 'saved';

export default function ProfilePage() {
  const { user, profile } = useAuth();
  const [eventTab, setEventTab] = useState<EventTab>('interested');
  const [events, setEvents] = useState<Event[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [friendCount, setFriendCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (user) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchData() {
    // First get user's event statuses, then fetch those events (includes private ones user has access to)
    const [statusesRes, friendsRes] = await Promise.all([
      supabase.from('event_statuses').select('event_id, status').eq('user_id', user!.id),
      supabase.from('friendships').select('id', { count: 'exact', head: true })
        .or(`user_id.eq.${user!.id},friend_id.eq.${user!.id}`)
        .eq('status', 'accepted'),
    ]);

    const statusData = statusesRes.data ?? [];
    const map: Record<string, string> = {};
    statusData.forEach((s: any) => { map[s.event_id] = s.status; });
    setStatuses(map);
    setFriendCount(friendsRes.count ?? 0);

    // Fetch all events the user has a status for (includes private events)
    if (statusData.length > 0) {
      const eventIds = statusData.map((s: any) => s.event_id);
      const { data: eventsData } = await supabase
        .from('events')
        .select('*')
        .in('id', eventIds)
        .order('date', { ascending: true });
      setEvents(eventsData ?? []);
    }
    setLoading(false);
  }

  const filteredEvents = events.filter((e) => {
    const status = statuses[e.id];
    switch (eventTab) {
      case 'interested': return status === 'interested' && e.date >= today;
      case 'confirmed': return (status === 'confirmed' || status === 'attended') && e.date >= today;
      case 'past': return e.date < today && status !== 'saved' && status !== 'not-interested';
      case 'saved': return status === 'saved';
      default: return false;
    }
  });

  const tabs: { key: EventTab; label: string; icon: any }[] = [
    { key: 'interested', label: 'Interessiert', icon: Heart },
    { key: 'confirmed', label: 'Bestätigt', icon: CheckCircle2 },
    { key: 'past', label: 'Vergangen', icon: Clock },
    { key: 'saved', label: 'Gespeichert', icon: Bookmark },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Profile Card */}
      <div className="rounded-2xl border border-border-subtle bg-surface">
        {/* Banner */}
        <div className="h-40 bg-gradient-to-br from-violet-500/20 to-purple-600/20 relative rounded-t-2xl overflow-hidden">
          {profile?.banner_url && (
            <img src={profile.banner_url} alt="" className="w-full h-full object-cover" />
          )}
          {/* Quick Actions */}
          <div className="absolute top-3 right-3 flex gap-2">
            <Link href="/app/settings" className="p-2 rounded-full bg-black/20 backdrop-blur-sm text-white hover:bg-black/30 transition-colors">
              <Settings size={16} />
            </Link>
          </div>
        </div>

        {/* Avatar + Info */}
        <div className="px-6 pb-6">
          <div className="w-24 h-24 rounded-full bg-elevated border-4 border-surface -mt-12 relative z-10 flex items-center justify-center text-2xl font-bold overflow-hidden">
            {profile?.avatar_url ? (
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
                <span className="flex items-center gap-1.5"><Globe size={13} strokeWidth={1.6} />{profile.website}</span>
              )}
              {profile?.instagram && (
                <span className="flex items-center gap-1.5"><AtSign size={13} strokeWidth={1.6} />{profile.instagram}</span>
              )}
            </div>

            {/* Stats */}
            <div className="flex gap-6 pt-2">
              <div className="text-center">
                <p className="text-lg font-heading font-bold">{friendCount}</p>
                <p className="text-[11px] text-muted-fg">Freunde</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-heading font-bold">{Object.values(statuses).filter((s) => s === 'interested').length}</p>
                <p className="text-[11px] text-muted-fg">Interessiert</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-heading font-bold">{Object.values(statuses).filter((s) => s === 'confirmed').length}</p>
                <p className="text-[11px] text-muted-fg">Bestätigt</p>
              </div>
            </div>

            {/* Interests */}
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

      {/* Event Tabs */}
      <div className="flex rounded-2xl bg-muted p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const count = events.filter((e) => {
            const s = statuses[e.id];
            if (t.key === 'interested') return s === 'interested' && e.date >= today;
            if (t.key === 'confirmed') return s === 'confirmed' && e.date >= today;
            if (t.key === 'past') return (s === 'interested' || s === 'confirmed') && e.date < today;
            if (t.key === 'saved') return s === 'saved';
            return false;
          }).length;
          return (
            <button
              key={t.key}
              onClick={() => setEventTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-medium transition-all duration-200 ${
                eventTab === t.key ? 'bg-surface text-foreground shadow-sm' : 'text-muted-fg hover:text-foreground'
              }`}
            >
              <Icon size={14} />
              {t.label}
              {count > 0 && <span className="text-[10px] opacity-60">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Events List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-surface border border-border-subtle animate-pulse" />
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="text-center py-12 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
          {eventTab === 'interested' && <Heart size={32} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />}
          {eventTab === 'confirmed' && <CheckCircle2 size={32} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />}
          {eventTab === 'past' && <Clock size={32} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />}
          {eventTab === 'saved' && <Bookmark size={32} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />}
          <p className="text-sm font-medium">Keine Events in dieser Kategorie</p>
        </div>
      ) : (
        <div className="space-y-2 stagger-children">
          {filteredEvents.map((event) => (
            <Link
              key={event.id}
              href={`/app/event/${event.id}`}
              className="group flex items-center gap-4 p-4 rounded-xl border border-border-subtle bg-surface hover:bg-elevated/50 hover:border-border-strong transition-all duration-200"
            >
              <div className="w-14 h-14 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                {event.image_url ? (
                  <img src={event.image_url} alt="" className="w-full h-full object-cover" />
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
                  <span className="flex items-center gap-1"><MapPin size={11} className="flex-shrink-0" /><span className="truncate">{event.location}</span></span>
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
      )}
    </div>
  );
}
