'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { MessageCircle, User, Users, Search, X, Megaphone } from 'lucide-react';

type ChatTab = 'dm' | 'event';

interface ChatRoomRow {
  id: string;
  type: string;
  title: string | null;
  event_id: string | null;
  updated_at: string;
  last_message?: string | null;
  unread_count?: number;
  other_user_name?: string;
  other_user_avatar?: string | null;
}

export default function ChatPage() {
  const { user, userType } = useAuth();
  const [tab, setTab] = useState<ChatTab>('dm');
  const [rooms, setRooms] = useState<ChatRoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const supabase = createClient();

  useEffect(() => {
    if (user) fetchRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchRooms() {
    const uid = user!.id;

    // 1. Get rooms the user is in
    const { data: participants } = await supabase
      .from('chat_participants')
      .select('room_id')
      .eq('user_id', uid);

    if (!participants?.length) {
      setRooms([]);
      setLoading(false);
      return;
    }

    const roomIds = participants.map((p) => p.room_id);

    // 2. Fetch rooms, last messages, other participants in parallel
    const [roomsRes, messagesRes, otherParticipantsRes] = await Promise.all([
      supabase.from('chat_rooms').select('*').in('id', roomIds).order('updated_at', { ascending: false }),
      supabase.from('chat_messages').select('*').in('room_id', roomIds).is('deleted_at', null).order('created_at', { ascending: false }).limit(roomIds.length * 3),
      supabase.from('chat_participants').select('room_id, user_id').in('room_id', roomIds).neq('user_id', uid),
    ]);

    const allMessages = messagesRes.data ?? [];
    const otherParts = otherParticipantsRes.data ?? [];

    // 3. Get other user profiles for DMs
    const otherUserIds = [...new Set(otherParts.map((p) => p.user_id))];
    let profileMap: Record<string, { full_name: string; avatar_url: string | null }> = {};
    if (otherUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', otherUserIds);
      (profiles ?? []).forEach((p) => { profileMap[p.id] = p; });
    }

    // 4. Build enriched rooms
    const enriched: ChatRoomRow[] = (roomsRes.data ?? []).map((room) => {
      const lastMsg = allMessages.find((m) => m.room_id === room.id);
      const otherPart = otherParts.find((p) => p.room_id === room.id);
      const otherProfile = otherPart ? profileMap[otherPart.user_id] : null;

      return {
        ...room,
        last_message: lastMsg?.content ?? null,
        other_user_name: otherProfile?.full_name ?? null,
        other_user_avatar: otherProfile?.avatar_url ?? null,
        unread_count: 0, // Would need last_read_at comparison for real counts
      };
    });

    setRooms(enriched);
    setLoading(false);
  }

  const dmRooms = rooms.filter((r) => r.type === 'dm');
  const eventRooms = rooms.filter((r) => r.type === 'event_group' || r.type === 'organizer_announcement');
  const currentRooms = tab === 'dm' ? dmRooms : eventRooms;

  const filtered = search
    ? currentRooms.filter((r) =>
        (r.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (r.other_user_name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : currentRooms;

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Jetzt';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Gestern';
    if (days < 7) return `${days}d`;
    return `${Math.floor(days / 7)}w`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight">Nachrichten</h1>
        <p className="text-sm text-muted-fg mt-1">Deine Chats und Gruppennachrichten</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-fg" />
        <input
          type="text"
          placeholder="Chats durchsuchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-10 py-3 rounded-2xl border border-border-subtle bg-surface text-sm placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-fg hover:text-foreground">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Tabs */}
      {userType !== 'organization' && (
        <div className="flex rounded-2xl bg-muted p-1">
          <button
            onClick={() => { setTab('dm'); setSearch(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 ${
              tab === 'dm' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-fg hover:text-foreground'
            }`}
          >
            <User size={15} />
            Direktnachrichten
            {dmRooms.length > 0 && <span className="text-[11px] bg-muted rounded-full px-1.5 py-0.5">{dmRooms.length}</span>}
          </button>
          <button
            onClick={() => { setTab('event'); setSearch(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 ${
              tab === 'event' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-fg hover:text-foreground'
            }`}
          >
            <Users size={15} />
            Event-Chats
            {eventRooms.length > 0 && <span className="text-[11px] bg-muted rounded-full px-1.5 py-0.5">{eventRooms.length}</span>}
          </button>
        </div>
      )}

      {/* Chat List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-[72px] rounded-xl bg-surface border border-border-subtle animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
          <MessageCircle size={36} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">
            {search ? 'Keine Chats gefunden' : tab === 'dm' ? 'Noch keine Direktnachrichten' : 'Noch keine Event-Chats'}
          </p>
        </div>
      ) : (
        <div className="space-y-1 stagger-children">
          {filtered.map((room) => (
            <div
              key={room.id}
              className="group flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-elevated/50 transition-all duration-200 cursor-pointer"
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                  {room.type === 'dm' ? (
                    room.other_user_avatar ? (
                      <img src={room.other_user_avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User size={20} strokeWidth={1.6} className="text-muted-fg/50" />
                    )
                  ) : room.type === 'organizer_announcement' ? (
                    <Megaphone size={20} strokeWidth={1.6} className="text-muted-fg/50" />
                  ) : (
                    <Users size={20} strokeWidth={1.6} className="text-muted-fg/50" />
                  )}
                </div>
                {/* Online indicator (placeholder) */}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-[14px] truncate">
                    {room.title ?? room.other_user_name ?? 'Chat'}
                  </h3>
                  <span className="text-[11px] text-muted-fg flex-shrink-0 ml-2">
                    {timeAgo(room.updated_at)}
                  </span>
                </div>
                <p className="text-[12px] text-muted-fg truncate mt-0.5">
                  {room.last_message ?? 'Keine Nachrichten'}
                </p>
              </div>

              {/* Unread badge */}
              {room.unread_count && room.unread_count > 0 && (
                <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-white">{room.unread_count}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
