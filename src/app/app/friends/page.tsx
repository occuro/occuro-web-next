'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import {
  Search, Users, X, BadgeCheck, UserPlus, UserCheck, Building2,
  Check, Loader2, UserX, Clock,
} from 'lucide-react';

type Tab = 'friends' | 'requests' | 'discover';

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
}

export default function FriendsPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('friends');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Friends
  const [friends, setFriends] = useState<PersonResult[]>([]);
  const [followedOrgs, setFollowedOrgs] = useState<OrgResult[]>([]);

  // Requests
  const [incomingRequests, setIncomingRequests] = useState<PersonResult[]>([]);
  const [outgoingIds, setOutgoingIds] = useState<Set<string>>(new Set());

  // Discover
  const [suggestions, setSuggestions] = useState<PersonResult[]>([]);
  const [searchResults, setSearchResults] = useState<PersonResult[]>([]);
  const [orgSearchResults, setOrgSearchResults] = useState<OrgResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Action busy states (per-id)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  // Helper: navigate to the public profile page using username when
  // available (cleaner URL) and falling back to the user id.
  const openProfile = useCallback((person: PersonResult) => {
    const slug = person.username?.trim() || person.id;
    router.push(`/app/profile/${slug}`);
  }, [router]);

  // Helper: navigate to the organizer profile page (always by id).
  const openOrgProfile = useCallback((org: OrgResult) => {
    router.push(`/app/organizer/${org.id}`);
  }, [router]);

  const setBusy = (id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [friendshipsRes, followsRes, suggestionsRes] = await Promise.all([
      supabase
        .from('friendships')
        .select('user_id, friend_id, status')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`),
      supabase
        .from('organizer_follows')
        .select('organizer_org_id')
        .eq('follower_id', user.id)
        .not('organizer_org_id', 'is', null),
      // Suggestions: any individual profile that's not us, not already a
      // friend, not blocked. Cap at 30. Server-side ranking is on the
      // mobile app — for the WebApp we keep it simple.
      supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url, bio, user_type')
        .neq('id', user.id)
        .eq('user_type', 'individual')
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    const friendships = (friendshipsRes.data ?? []) as Array<{ user_id: string; friend_id: string; status: string }>;
    // Dedupe across both directions: if the friendships table stores a
    // row for each side of the relationship (A→B and B→A), the naive
    // extraction below would list the same friend twice. Using a Set
    // here is the bare minimum to keep the UI from rendering duplicate
    // rows regardless of how the table is modelled.
    const acceptedIds = Array.from(new Set(
      friendships
        .filter((f) => f.status === 'accepted')
        .map((f) => (f.user_id === user.id ? f.friend_id : f.user_id))
    ));
    const incomingIds = Array.from(new Set(
      friendships
        .filter((f) => f.status === 'pending' && f.friend_id === user.id)
        .map((f) => f.user_id)
    ));
    const outgoingPendingIds = Array.from(new Set(
      friendships
        .filter((f) => f.status === 'pending' && f.user_id === user.id)
        .map((f) => f.friend_id)
    ));

    setOutgoingIds(new Set(outgoingPendingIds));

    // Resolve all relevant profiles in one query
    const allIds = [...new Set([...acceptedIds, ...incomingIds])];
    let profileMap = new Map<string, PersonResult>();
    if (allIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url, bio')
        .in('id', allIds);
      profileMap = new Map(((profs ?? []) as PersonResult[]).map((p) => [p.id, p]));
    }

    const friendsList = acceptedIds
      .map((id) => profileMap.get(id))
      .filter((p): p is PersonResult => Boolean(p))
      .sort((a, b) =>
        (a.full_name ?? '').localeCompare(b.full_name ?? '', 'de', { sensitivity: 'base' }),
      );
    setFriends(friendsList);

    const incomingList = incomingIds
      .map((id) => profileMap.get(id))
      .filter((p): p is PersonResult => Boolean(p))
      .sort((a, b) =>
        (a.full_name ?? '').localeCompare(b.full_name ?? '', 'de', { sensitivity: 'base' }),
      );
    setIncomingRequests(incomingList);

    // Followed orgs
    const orgIds = ((followsRes.data ?? []) as Array<{ organizer_org_id: string }>)
      .map((f) => f.organizer_org_id)
      .filter(Boolean);
    if (orgIds.length > 0) {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name, avatar_url, category, verified')
        .in('id', orgIds);
      setFollowedOrgs(((orgs ?? []) as OrgResult[]).sort((a, b) =>
        (a.name ?? '').localeCompare(b.name ?? '', 'de', { sensitivity: 'base' }),
      ));
    } else {
      setFollowedOrgs([]);
    }

    // Suggestions: filter out friends + incoming + outgoing requests
    const excludeIds = new Set([...acceptedIds, ...incomingIds, ...outgoingPendingIds]);
    setSuggestions(
      ((suggestionsRes.data ?? []) as PersonResult[])
        .filter((p) => !excludeIds.has(p.id))
        .sort((a, b) =>
          (a.full_name ?? '').localeCompare(b.full_name ?? '', 'de', { sensitivity: 'base' }),
        ),
    );

    setLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // ── Realtime: friendships table ────────────────────────────────
  // Subscribe to any change on the friendships table that touches the
  // current user (either as user_id or friend_id). When a friend
  // request comes in, gets accepted, declined, or removed, we just
  // re-run the loader. Cheap because postgres_changes only fires for
  // rows that match the filter.
  useEffect(() => {
    if (!user?.id) return;
    let pending = false;
    const trigger = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        void reload();
      });
    };

    // We listen on TWO filters because postgres_changes doesn't support
    // OR conditions inline. Both filters target the same table so we
    // get notified for incoming requests (friend_id=us) AND outgoing
    // ones (user_id=us).
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`friendships:${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'friendships', filter: `user_id=eq.${user.id}` },
          trigger,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'friendships', filter: `friend_id=eq.${user.id}` },
          trigger,
        )
        .subscribe();
    } catch (e) {
      console.warn('[friends] realtime subscribe failed:', e);
    }
    return () => {
      try { if (channel) void supabase.removeChannel(channel); } catch {}
    };
  }, [supabase, user?.id, reload]);

  // ── Search (debounced) ─────────────────────────────────────────
  useEffect(() => {
    if (search.trim().length < 2) {
      setSearchResults([]);
      setOrgSearchResults([]);
      return;
    }
    const handler = setTimeout(async () => {
      setSearching(true);
      const q = `%${search.trim().replace(/%/g, '\\%')}%`;
      const [peopleRes, orgRes] = await Promise.all([
        // Individual profiles only. Without the user_type filter,
        // organizer-owned profiles would show up in "Personen" results
        // and clicking them would open the individual-user UI (with
        // Nachricht + Freund-Buttons) instead of the organizer page.
        supabase
          .from('profiles')
          .select('id, full_name, username, avatar_url, bio')
          .or(`full_name.ilike.${q},username.ilike.${q}`)
          .neq('id', user!.id)
          .eq('user_type', 'individual')
          .limit(30),
        supabase
          .from('organizations')
          .select('id, name, avatar_url, category, verified')
          .ilike('name', q)
          .limit(15),
      ]);
      setSearchResults(
        ((peopleRes.data ?? []) as PersonResult[]).sort((a, b) =>
          (a.full_name ?? '').localeCompare(b.full_name ?? '', 'de', { sensitivity: 'base' }),
        ),
      );
      setOrgSearchResults(
        ((orgRes.data ?? []) as OrgResult[]).sort((a, b) =>
          (a.name ?? '').localeCompare(b.name ?? '', 'de', { sensitivity: 'base' }),
        ),
      );
      setSearching(false);
    }, 300);
    return () => clearTimeout(handler);
  }, [search, supabase, user]);

  // ── Friend actions ─────────────────────────────────────────────
  async function sendRequest(targetId: string) {
    if (!user) return;
    setBusy(targetId, true);
    await supabase.from('friendships').insert({
      user_id: user.id,
      friend_id: targetId,
      status: 'pending',
    });
    setOutgoingIds((prev) => new Set(prev).add(targetId));
    setBusy(targetId, false);
  }

  async function cancelRequest(targetId: string) {
    if (!user) return;
    setBusy(targetId, true);
    await supabase
      .from('friendships')
      .delete()
      .match({ user_id: user.id, friend_id: targetId, status: 'pending' });
    setOutgoingIds((prev) => {
      const next = new Set(prev);
      next.delete(targetId);
      return next;
    });
    setBusy(targetId, false);
  }

  async function acceptRequest(requesterId: string) {
    if (!user) return;
    setBusy(requesterId, true);
    await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .match({ user_id: requesterId, friend_id: user.id, status: 'pending' });
    await reload();
    setBusy(requesterId, false);
  }

  async function declineRequest(requesterId: string) {
    if (!user) return;
    setBusy(requesterId, true);
    await supabase
      .from('friendships')
      .delete()
      .match({ user_id: requesterId, friend_id: user.id, status: 'pending' });
    setIncomingRequests((prev) => prev.filter((p) => p.id !== requesterId));
    setBusy(requesterId, false);
  }

  async function removeFriend(friendId: string) {
    if (!user) return;
    if (!confirm('Freund wirklich entfernen?')) return;
    setBusy(friendId, true);
    await supabase
      .from('friendships')
      .delete()
      .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)
      .eq('status', 'accepted');
    setFriends((prev) => prev.filter((p) => p.id !== friendId));
    setBusy(friendId, false);
  }

  // ── Filtered friends list (when not searching) ─────────────────
  const filteredFriends = useMemo(() => {
    if (!search.trim()) return friends;
    const q = search.trim().toLowerCase();
    return friends.filter((f) =>
      (f.full_name ?? '').toLowerCase().includes(q) ||
      (f.username ?? '').toLowerCase().includes(q),
    );
  }, [friends, search]);

  const isSearching = search.trim().length >= 2;

  return (
    <div className="max-w-4xl mx-auto space-y-5 sm:space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">Freunde</h1>
        <p className="text-sm text-muted-fg mt-1">Verwalte deine Freunde und entdecke neue Leute</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-fg" />
        <input
          type="text"
          placeholder={tab === 'friends' ? 'Freunde durchsuchen…' : 'Personen oder Veranstalter suchen…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-10 py-3 rounded-2xl border border-border-subtle bg-surface text-sm placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-focus focus:border-focus transition-all"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-fg hover:text-foreground"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex rounded-2xl bg-muted p-1">
        <TabButton
          active={tab === 'friends'}
          onClick={() => setTab('friends')}
          icon={Users}
          label="Freunde"
          count={friends.length}
        />
        <TabButton
          active={tab === 'requests'}
          onClick={() => setTab('requests')}
          icon={UserCheck}
          label="Anfragen"
          count={incomingRequests.length}
          highlight={incomingRequests.length > 0}
        />
        <TabButton
          active={tab === 'discover'}
          onClick={() => setTab('discover')}
          icon={UserPlus}
          label="Entdecken"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-surface border border-border-subtle animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* ── Friends tab ──────────────────────────────────── */}
          {tab === 'friends' && (
            <>
              {/* Followed Organizers (only when no search active) */}
              {!isSearching && followedOrgs.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-[12px] font-semibold text-muted-fg uppercase tracking-wider">
                      Gefolgte Veranstalter
                    </h2>
                  </div>
                  {/* pt-2 is mandatory here: overflow-x-auto implicitly
                      clips overflow-y too (CSS quirk), which was
                      cropping the top of the ring-2 around each
                      avatar. Gives the ring breathing room. */}
                  <div className="flex gap-3 overflow-x-auto pt-2 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                    {followedOrgs.map((org) => (
                      <button
                        key={org.id}
                        type="button"
                        onClick={() => openOrgProfile(org)}
                        className="flex flex-col items-center gap-2 min-w-[72px] group"
                      >
                        <div
                          className="w-14 h-14 rounded-full flex items-center justify-center text-sm font-semibold ring-2 ring-border-subtle group-hover:ring-border-strong transition-all p-[5px]"
                          style={{ backgroundColor: 'var(--muted)' }}
                        >
                          {org.avatar_url && org.avatar_url.trim() ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={org.avatar_url}
                              alt=""
                              // 5px padding on the outer container + the
                              // image rounded-full on its own creates a
                              // clear gap between logo edge and the outer
                              // ring, so edge-to-edge logos (like the
                              // occuro badge) don't look cropped at the
                              // top where the ring hugs the image.
                              className="w-full h-full object-cover object-center rounded-full"
                            />
                          ) : (
                            <span className="text-foreground text-[15px]">
                              {(org.name ?? '?').trim().charAt(0).toUpperCase() || '?'}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-center font-medium truncate w-full group-hover:text-foreground transition-colors">{org.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredFriends.length === 0 ? (
                <EmptyState
                  icon={Users}
                  text={isSearching ? 'Keine Freunde gefunden' : 'Noch keine Freunde'}
                  subtitle={isSearching ? undefined : 'Wechsle zu „Entdecken" um neue Leute zu finden.'}
                />
              ) : (
                <div className="space-y-2 stagger-children">
                  {filteredFriends.map((friend) => (
                    <PersonRow
                      key={friend.id}
                      person={friend}
                      busy={busyIds.has(friend.id)}
                      onPreview={openProfile}
                      action={
                        <button
                          onClick={(e) => { e.stopPropagation(); void removeFriend(friend.id); }}
                          disabled={busyIds.has(friend.id)}
                          className="px-3 py-1.5 rounded-xl text-[11px] font-semibold border border-border-subtle hover:bg-elevated transition-colors flex items-center gap-1.5"
                        >
                          <UserX size={11} /> Entfernen
                        </button>
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Requests tab ─────────────────────────────────── */}
          {tab === 'requests' && (
            incomingRequests.length === 0 ? (
              <EmptyState
                icon={UserCheck}
                text="Keine offenen Anfragen"
                subtitle="Wenn dir jemand eine Freundschaftsanfrage sendet, erscheint sie hier."
              />
            ) : (
              <div className="space-y-2 stagger-children">
                {incomingRequests.map((person) => (
                  <PersonRow
                    key={person.id}
                    person={person}
                    busy={busyIds.has(person.id)}
                    action={
                      <div className="flex gap-2">
                        <button
                          onClick={() => void declineRequest(person.id)}
                          disabled={busyIds.has(person.id)}
                          className="px-3 py-1.5 rounded-xl text-[11px] font-semibold border border-border-subtle hover:bg-elevated transition-colors"
                        >
                          Ablehnen
                        </button>
                        <button
                          onClick={() => void acceptRequest(person.id)}
                          disabled={busyIds.has(person.id)}
                          className="px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-primary-bg text-primary-text hover:bg-primary-hover transition-colors flex items-center gap-1.5"
                        >
                          {busyIds.has(person.id) ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                          Annehmen
                        </button>
                      </div>
                    }
                  />
                ))}
              </div>
            )
          )}

          {/* ── Discover tab ─────────────────────────────────── */}
          {tab === 'discover' && (
            <>
              {isSearching ? (
                <>
                  {/* Search results */}
                  {searching && (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 size={18} className="animate-spin text-muted-fg" />
                    </div>
                  )}

                  {!searching && searchResults.length === 0 && orgSearchResults.length === 0 && (
                    <EmptyState icon={Search} text="Nichts gefunden" subtitle="Versuch einen anderen Suchbegriff." />
                  )}

                  {searchResults.length > 0 && (
                    <div>
                      <h2 className="text-[12px] font-semibold text-muted-fg uppercase tracking-wider mb-3">
                        Personen
                      </h2>
                      <div className="space-y-2 stagger-children">
                        {searchResults.map((person) => (
                          <PersonRow
                            key={person.id}
                            person={person}
                            busy={busyIds.has(person.id)}
                            onPreview={openProfile}
                            action={
                              outgoingIds.has(person.id) ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); void cancelRequest(person.id); }}
                                  disabled={busyIds.has(person.id)}
                                  className="px-3 py-1.5 rounded-xl text-[11px] font-semibold border border-border-subtle hover:bg-elevated transition-colors flex items-center gap-1.5"
                                >
                                  <Clock size={11} /> Gesendet
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); void sendRequest(person.id); }}
                                  disabled={busyIds.has(person.id)}
                                  className="px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-primary-bg text-primary-text hover:bg-primary-hover transition-colors flex items-center gap-1.5"
                                >
                                  {busyIds.has(person.id) ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />}
                                  Hinzufügen
                                </button>
                              )
                            }
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {orgSearchResults.length > 0 && (
                    <div>
                      <h2 className="text-[12px] font-semibold text-muted-fg uppercase tracking-wider mb-3">
                        Veranstalter
                      </h2>
                      <div className="space-y-2">
                        {orgSearchResults.map((org) => <OrgRow key={org.id} org={org} onPreview={openOrgProfile} />)}
                      </div>
                    </div>
                  )}
                </>
              ) : suggestions.length === 0 ? (
                <EmptyState icon={UserPlus} text="Keine Vorschläge" subtitle="Suche nach einem Namen oder Username." />
              ) : (
                <div>
                  <h2 className="text-[12px] font-semibold text-muted-fg uppercase tracking-wider mb-3">
                    Personen, die du kennen könntest
                  </h2>
                  <div className="space-y-2 stagger-children">
                    {suggestions.slice(0, 12).map((person) => (
                      <PersonRow
                        key={person.id}
                        person={person}
                        busy={busyIds.has(person.id)}
                        onPreview={openProfile}
                        action={
                          outgoingIds.has(person.id) ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); void cancelRequest(person.id); }}
                              disabled={busyIds.has(person.id)}
                              className="px-3 py-1.5 rounded-xl text-[11px] font-semibold border border-border-subtle hover:bg-elevated transition-colors flex items-center gap-1.5"
                            >
                              <Clock size={11} /> Gesendet
                            </button>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); void sendRequest(person.id); }}
                              disabled={busyIds.has(person.id)}
                              className="px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-primary-bg text-primary-text hover:bg-primary-hover transition-colors flex items-center gap-1.5"
                            >
                              {busyIds.has(person.id) ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />}
                              Hinzufügen
                            </button>
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────

function TabButton({
  active, onClick, icon: Icon, label, count, highlight,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Users;
  label: string;
  count?: number;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 rounded-xl text-[12px] sm:text-[13px] font-medium transition-all duration-200 ${
        active ? 'bg-surface text-foreground shadow-sm' : 'text-muted-fg hover:text-foreground'
      }`}
    >
      <Icon size={14} strokeWidth={active ? 2.2 : 1.8} />
      {label}
      {typeof count === 'number' && count > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-xl ${highlight && !active ? 'bg-primary-bg text-primary-text' : 'bg-elevated'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function PersonRow({
  person, action, busy, onPreview,
}: {
  person: PersonResult;
  action?: React.ReactNode;
  busy?: boolean;
  /** When set, the row becomes clickable and triggers a profile preview. */
  onPreview?: (person: PersonResult) => void;
}) {
  const inner = (
    <>
      <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center text-[13px] font-semibold flex-shrink-0 overflow-hidden">
        {person.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={person.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-foreground/70">{person.full_name?.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-[14px] truncate">{person.full_name}</h3>
        {person.username && (
          <p className="text-[12px] text-muted-fg truncate">@{person.username}</p>
        )}
      </div>
      {action && <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>{action}</div>}
    </>
  );

  if (onPreview) {
    return (
      <button
        type="button"
        onClick={() => onPreview(person)}
        className={`w-full text-left flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl border border-border-subtle bg-surface hover:bg-elevated/40 hover:border-border-strong transition-colors ${busy ? 'opacity-60' : ''}`}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl border border-border-subtle bg-surface ${busy ? 'opacity-60' : ''}`}>
      {inner}
    </div>
  );
}

function OrgRow({ org, onPreview }: { org: OrgResult; onPreview?: (org: OrgResult) => void }) {
  const Wrapper = onPreview
    ? ({ children }: { children: React.ReactNode }) => (
        <button
          type="button"
          onClick={() => onPreview(org)}
          className="w-full text-left flex items-center gap-4 p-3 sm:p-4 rounded-2xl border border-border-subtle bg-surface hover:bg-elevated/40 hover:border-border-strong transition-colors"
        >
          {children}
        </button>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <div className="flex items-center gap-4 p-3 sm:p-4 rounded-2xl border border-border-subtle bg-surface">
          {children}
        </div>
      );

  return (
    <Wrapper>
      <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center text-[13px] font-semibold flex-shrink-0 overflow-hidden">
        {org.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-foreground/70"><Building2 size={16} /></span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h3 className="font-semibold text-[14px] truncate">{org.name}</h3>
          {org.verified && <BadgeCheck size={14} className="text-verified flex-shrink-0" />}
        </div>
        {org.category && <p className="text-[12px] text-muted-fg truncate">{org.category}</p>}
      </div>
    </Wrapper>
  );
}

function EmptyState({ icon: Icon, text, subtitle }: { icon: typeof Users; text: string; subtitle?: string }) {
  return (
    <div className="text-center py-16 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
      <Icon size={36} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />
      <p className="text-sm font-medium">{text}</p>
      {subtitle && <p className="text-[12px] mt-1">{subtitle}</p>}
    </div>
  );
}
