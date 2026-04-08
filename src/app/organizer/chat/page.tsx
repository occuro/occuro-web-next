'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { MessageCircle, User, Users } from 'lucide-react';

interface ChatRoomRow {
  id: string;
  type: string;
  title: string | null;
  updated_at: string;
}

export default function OrganizerChatPage() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<ChatRoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (user) fetchRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchRooms() {
    const { data: participants } = await supabase
      .from('chat_participants')
      .select('room_id')
      .eq('user_id', user!.id);

    if (!participants?.length) {
      setRooms([]);
      setLoading(false);
      return;
    }

    const roomIds = participants.map((p) => p.room_id);
    const { data } = await supabase
      .from('chat_rooms')
      .select('*')
      .in('id', roomIds)
      .order('updated_at', { ascending: false });

    setRooms(data ?? []);
    setLoading(false);
  }

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight">Nachrichten</h1>
        <p className="text-sm text-muted-fg mt-1">Kommunikation mit deinen Besuchern</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-18 rounded-xl bg-surface border border-border-subtle animate-pulse" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-20 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
          <MessageCircle size={40} strokeWidth={1.2} className="mx-auto mb-4 opacity-40" />
          <p className="text-base font-medium">Noch keine Nachrichten</p>
        </div>
      ) : (
        <div className="space-y-2 stagger-children">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="flex items-center gap-4 p-4 rounded-xl border border-border-subtle bg-surface hover:bg-elevated/50 hover:border-border-strong transition-all duration-200 cursor-pointer"
            >
              <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                {room.type === 'dm' ? (
                  <User size={18} strokeWidth={1.6} className="text-muted-fg/60" />
                ) : (
                  <Users size={18} strokeWidth={1.6} className="text-muted-fg/60" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[14px] truncate">{room.title ?? 'Chat'}</h3>
              </div>
              <span className="text-[11px] text-muted-fg flex-shrink-0">{timeAgo(room.updated_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
