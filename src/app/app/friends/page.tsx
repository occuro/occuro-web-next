'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatDate, getCategoryColor } from '@/lib/utils';
import { Search, Users, User, Music, CalendarDays, Building2, X, BadgeCheck, ArrowRight } from 'lucide-react';

type SearchScope = 'people' | 'organizers' | 'events' | 'artists';

interface PersonResult {
  id: string;
  full_name: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
}

interface OrgResult {
  id: string;
  name: string;
  avatar_url: string | null;
  category: string | null;
  verified: boolean;
  bio: string | null;
}

export default function FriendsPage() {
  const { user } = useAuth();
  const [scope, setScope] = useState<SearchScope>('people');
  const [search, setSearch] = useState('');
  const [friends, setFriends] = useState<PersonResult[]>([]);
  const [searchResults, setSearchResults] = useState<PersonResult[]>([]);
  const [orgResults, setOrgResults] = useState<OrgResult[]>([]);
  const [followedOrgs, setFollowedOrgs] = useState<OrgResult[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (user) fetchInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (search.length >= 2) doSearch();
    else { setSearchResults([]); setOrgResults([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, scope]);

  async function fetchInitial() {
    // Friends
    const { data: friendships } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .or(`user_id.eq.${user!.id},friend_id.eq.${user!.id}`)
      .eq('status', 'accepted');

    if (friendships?.length) {
      const friendIds = friendships.map((f) => f.user_id === user!.id ? f.friend_id : f.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url, bio')
        .in('id', friendIds);
      setFriends(profiles ?? []);
    }

    // Followed orgs
    const { data: follows } = await supabase
      .from('organizer_follows')
      .select('organizer_org_id')
      .eq('follower_id', user!.id)
      .not('organizer_org_id', 'is', null);

    if (follows?.length) {
      const orgIds = follows.map((f) => f.organizer_org_id).filter(Boolean);
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name, avatar_url, category, verified, bio')
        .in('id', orgIds);
      setFollowedOrgs(orgs ?? []);
    }

    setLoading(false);
  }

  async function doSearch() {
    const q = `%${search}%`;
    if (scope === 'people') {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url, bio')
        .or(`full_name.ilike.${q},username.ilike.${q}`)
        .neq('id', user!.id)
        .limit(20);
      setSearchResults(data ?? []);
    } else if (scope === 'organizers') {
      const { data } = await supabase
        .from('organizations')
        .select('id, name, avatar_url, category, verified, bio')
        .ilike('name', q)
        .limit(20);
      setOrgResults(data ?? []);
    }
  }

  const isSearching = search.length >= 2;

  const scopes: { key: SearchScope; label: string; icon: any }[] = [
    { key: 'people', label: 'Personen', icon: Users },
    { key: 'organizers', label: 'Veranstalter', icon: Building2 },
    { key: 'events', label: 'Events', icon: CalendarDays },
    { key: 'artists', label: 'Künstler', icon: Music },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight">Entdecken</h1>
        <p className="text-sm text-muted-fg mt-1">Finde Freunde, Veranstalter und Events</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-fg" />
        <input
          type="text"
          placeholder={`${scopes.find((s) => s.key === scope)?.label} suchen...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-10 py-3.5 rounded-2xl border border-border-subtle bg-surface text-sm placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/30 transition-all duration-200"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-fg hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Scope Tabs */}
      <div className="flex gap-2">
        {scopes.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              onClick={() => { setScope(s.key); setSearch(''); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-200 ${
                scope === s.key
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-surface border border-border-subtle text-foreground/70 hover:text-foreground hover:border-border-strong'
              }`}
            >
              <Icon size={14} strokeWidth={scope === s.key ? 2.2 : 1.8} />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-18 rounded-xl bg-surface border border-border-subtle animate-pulse" />
          ))}
        </div>
      ) : isSearching ? (
        /* Search Results */
        <div className="space-y-2 stagger-children">
          {scope === 'people' && (
            searchResults.length === 0 ? (
              <EmptyState icon={Users} text="Keine Personen gefunden" />
            ) : (
              searchResults.map((p) => (
                <PersonRow key={p.id} person={p} />
              ))
            )
          )}
          {scope === 'organizers' && (
            orgResults.length === 0 ? (
              <EmptyState icon={Building2} text="Keine Veranstalter gefunden" />
            ) : (
              orgResults.map((o) => (
                <OrgRow key={o.id} org={o} />
              ))
            )
          )}
          {scope === 'events' && (
            <EmptyState icon={CalendarDays} text="Event-Suche kommt bald" />
          )}
          {scope === 'artists' && (
            <EmptyState icon={Music} text="Künstler-Suche kommt bald" />
          )}
        </div>
      ) : (
        /* Default: Friends + Followed Organizers */
        <div className="space-y-8">
          {/* Followed Organizers */}
          {followedOrgs.length > 0 && (
            <div>
              <h2 className="text-base font-heading font-semibold mb-3">Gefolgte Veranstalter</h2>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {followedOrgs.map((org) => (
                  <div key={org.id} className="flex flex-col items-center gap-2 min-w-[80px]">
                    <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-sm font-semibold overflow-hidden ring-2 ring-border-subtle">
                      {org.avatar_url ? (
                        <img src={org.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        org.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <span className="text-[11px] text-center font-medium truncate w-full">{org.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Friends */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-heading font-semibold">Freunde ({friends.length})</h2>
            </div>
            {friends.length === 0 ? (
              <EmptyState icon={Users} text="Noch keine Freunde" subtitle="Suche nach Personen um Freundschaftsanfragen zu senden." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 stagger-children">
                {friends.map((friend) => (
                  <PersonRow key={friend.id} person={friend} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PersonRow({ person }: { person: PersonResult }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-border-subtle bg-surface hover:bg-elevated/50 hover:border-border-strong transition-all duration-200 cursor-pointer">
      <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center text-[13px] font-semibold flex-shrink-0 overflow-hidden">
        {person.avatar_url ? (
          <img src={person.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          person.full_name?.charAt(0).toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-[14px] truncate">{person.full_name}</h3>
        {person.username && <p className="text-[12px] text-muted-fg">@{person.username}</p>}
      </div>
    </div>
  );
}

function OrgRow({ org }: { org: OrgResult }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-border-subtle bg-surface hover:bg-elevated/50 hover:border-border-strong transition-all duration-200 cursor-pointer">
      <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center text-[13px] font-semibold flex-shrink-0 overflow-hidden">
        {org.avatar_url ? (
          <img src={org.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          org.name.charAt(0).toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h3 className="font-semibold text-[14px] truncate">{org.name}</h3>
          {org.verified && <BadgeCheck size={14} className="text-violet-500 flex-shrink-0" />}
        </div>
        {org.category && <p className="text-[12px] text-muted-fg">{org.category}</p>}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, text, subtitle }: { icon: any; text: string; subtitle?: string }) {
  return (
    <div className="text-center py-16 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
      <Icon size={36} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />
      <p className="text-sm font-medium">{text}</p>
      {subtitle && <p className="text-[12px] mt-1">{subtitle}</p>}
    </div>
  );
}
