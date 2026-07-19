'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { Search, UserCheck, X } from 'lucide-react';

interface FollowerRow {
  id: string;
  follower_id: string;
  created_at: string | null;
  follower_name?: string;
  follower_username?: string | null;
  follower_avatar?: string | null;
  follower_location?: string | null;
}

export default function FollowersPage() {
  const { user, organization } = useAuth();
  const [followers, setFollowers] = useState<FollowerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const supabase = createClient();

  useEffect(() => {
    if (user) fetchFollowers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchFollowers() {
    let query = supabase.from('organizer_follows').select('id, follower_id, created_at');
    if (organization?.id) query = query.eq('organizer_org_id', organization.id);
    else query = query.eq('organizer_profile_id', user!.id);
    query = query.order('created_at', { ascending: false });

    const { data } = await query;
    if (!data?.length) { setFollowers([]); setLoading(false); return; }

    const followerIds = data.map((f) => f.follower_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url, location')
      .in('id', followerIds);

    const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
    setFollowers(data.map((f) => ({
      ...f,
      follower_name: profileMap[f.follower_id]?.full_name ?? 'Unbekannt',
      follower_username: profileMap[f.follower_id]?.username ?? null,
      follower_avatar: profileMap[f.follower_id]?.avatar_url ?? null,
      follower_location: profileMap[f.follower_id]?.location ?? null,
    })));
    setLoading(false);
  }

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return `${Math.floor(days / 7)}w`;
  };

  const filtered = search
    ? followers.filter((f) =>
        (f.follower_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (f.follower_username ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : followers;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight">Follower</h1>
        <p className="text-sm text-muted-fg mt-1">{followers.length} Personen folgen dir</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-fg" />
        <input
          type="text"
          placeholder="Follower suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-10 py-3 rounded-2xl border border-border-subtle bg-surface text-sm placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-focus transition-all"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-fg hover:text-foreground">
            <X size={16} />
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <div key={i} className="h-[68px] rounded-xl bg-surface border border-border-subtle animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
          <UserCheck size={36} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">{search ? 'Keine Follower gefunden' : 'Noch keine Follower'}</p>
        </div>
      ) : (
        <div className="space-y-1.5 stagger-children">
          {filtered.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-4 px-4 py-3.5 rounded-xl border border-border-subtle bg-surface hover:bg-elevated/50 hover:border-border-strong transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-[13px] font-semibold overflow-hidden flex-shrink-0">
                {f.follower_avatar ? (
                  <img src={f.follower_avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  f.follower_name?.charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-[14px] truncate">{f.follower_name}</h3>
                <p className="text-[12px] text-muted-fg truncate">
                  {f.follower_username ? `@${f.follower_username}` : f.follower_location ?? ''}
                </p>
              </div>
              {f.created_at && (
                <span className="text-[11px] text-muted-fg bg-muted px-2 py-1 rounded-xl flex-shrink-0">
                  {timeAgo(f.created_at)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
