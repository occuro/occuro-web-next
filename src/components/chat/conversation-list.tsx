'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useChatRooms, type ChatRoom } from '@/lib/hooks/useChatRooms';
import {
  MessageCircle, Search, X, User, Users, Megaphone, Loader2,
} from 'lucide-react';

interface ConversationListProps {
  /**
   * Where chat detail pages live. Used to build per-room links.
   * - User: "/app/chat"
   * - Organizer: "/organizer/chat"
   */
  basePath: string;
}

type Tab = 'dm' | 'event';

export function ConversationList({ basePath }: ConversationListProps) {
  const { user, userType } = useAuth();
  const { rooms, loading } = useChatRooms(user?.id);
  const [tab, setTab] = useState<Tab>('dm');
  const [search, setSearch] = useState('');

  const dmRooms = rooms.filter((r) => r.type === 'dm');
  const eventRooms = rooms.filter((r) => r.type === 'event_group' || r.type === 'organizer_announcement');
  const isOrgVariant = userType === 'organization';

  // Organizers don't have personal DMs in this UI — they only see event/announcement rooms.
  const currentRooms = isOrgVariant ? eventRooms : tab === 'dm' ? dmRooms : eventRooms;

  const filtered = search
    ? currentRooms.filter((r) => {
        const q = search.toLowerCase();
        return (
          (r.title ?? '').toLowerCase().includes(q) ||
          (r.other_user_name ?? '').toLowerCase().includes(q) ||
          (r.other_user_username ?? '').toLowerCase().includes(q) ||
          r.last_message_preview.toLowerCase().includes(q)
        );
      })
    : currentRooms;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight">Nachrichten</h1>
        <p className="text-sm text-muted-fg mt-1">
          {isOrgVariant ? 'Kommunikation mit deinen Besuchern' : 'Deine Chats und Gruppennachrichten'}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-fg" />
        <input
          type="text"
          placeholder="Chats durchsuchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-10 py-3 rounded-2xl border border-border-subtle bg-surface text-sm placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/30 transition-all"
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

      {/* Tabs (only for individual users) */}
      {!isOrgVariant && (
        <div className="flex rounded-2xl bg-muted p-1">
          <TabButton active={tab === 'dm'} onClick={() => { setTab('dm'); setSearch(''); }} icon={User} label="Direktnachrichten" count={dmRooms.length} />
          <TabButton active={tab === 'event'} onClick={() => { setTab('event'); setSearch(''); }} icon={Users} label="Event-Chats" count={eventRooms.length} />
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
        <EmptyState
          searching={Boolean(search)}
          tab={isOrgVariant ? 'event' : tab}
        />
      ) : (
        <div className="space-y-1 stagger-children">
          {filtered.map((room) => (
            <ConversationRow key={room.id} room={room} basePath={basePath} />
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────

function TabButton({
  active, onClick, icon: Icon, label, count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof User;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 ${
        active ? 'bg-surface text-foreground shadow-sm' : 'text-muted-fg hover:text-foreground'
      }`}
    >
      <Icon size={15} />
      {label}
      {count > 0 && <span className="text-[11px] bg-elevated rounded-full px-1.5 py-0.5">{count}</span>}
    </button>
  );
}

function ConversationRow({ room, basePath }: { room: ChatRoom; basePath: string }) {
  const displayTitle = room.type === 'dm' ? room.other_user_name ?? 'Chat' : room.title ?? 'Event-Chat';
  const subtitle = room.type === 'dm' && room.other_user_username
    ? `@${room.other_user_username}`
    : null;

  return (
    <Link
      href={`${basePath}/${room.id}`}
      className="group flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-elevated/50 transition-all duration-200"
    >
      <ChatAvatar room={room} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className={`text-[14px] truncate ${room.unread_count > 0 ? 'font-bold text-foreground' : 'font-semibold text-foreground/90'}`}>
            {displayTitle}
            {subtitle && (
              <span className="ml-1.5 text-[11px] font-normal text-muted-fg">{subtitle}</span>
            )}
          </h3>
          {room.last_message_at && (
            <span className={`text-[11px] flex-shrink-0 ${room.unread_count > 0 ? 'text-violet-400 font-semibold' : 'text-muted-fg'}`}>
              {timeAgo(room.last_message_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className={`text-[12px] truncate flex-1 ${room.unread_count > 0 ? 'text-foreground' : 'text-muted-fg'}`}>
            {room.last_message_preview}
          </p>
          {room.unread_count > 0 && (
            <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-violet-600 flex items-center justify-center">
              <span className="text-[10px] font-bold text-white leading-none">
                {room.unread_count > 99 ? '99+' : room.unread_count}
              </span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function ChatAvatar({ room }: { room: ChatRoom }) {
  if (room.type === 'dm') {
    return (
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
        {room.other_user_avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={room.other_user_avatar} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm font-semibold text-foreground/70">
            {(room.other_user_name ?? 'U').charAt(0).toUpperCase()}
          </span>
        )}
      </div>
    );
  }

  if (room.type === 'organizer_announcement') {
    return (
      <div className="w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
        <Megaphone size={20} className="text-amber-400" strokeWidth={1.8} />
      </div>
    );
  }

  // event_group: prefer the event banner image if available
  if (room.event_banner_url) {
    return (
      <div className="w-12 h-12 rounded-2xl bg-muted overflow-hidden flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={room.event_banner_url} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className="w-12 h-12 rounded-2xl bg-violet-500/15 flex items-center justify-center flex-shrink-0">
      <Users size={20} className="text-violet-400" strokeWidth={1.8} />
    </div>
  );
}

function EmptyState({ searching, tab }: { searching: boolean; tab: 'dm' | 'event' }) {
  return (
    <div className="text-center py-16 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
      <MessageCircle size={36} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />
      <p className="text-sm font-medium">
        {searching
          ? 'Keine Chats gefunden'
          : tab === 'dm'
            ? 'Noch keine Direktnachrichten'
            : 'Noch keine Event-Chats'}
      </p>
      {!searching && (
        <p className="text-[12px] text-muted-fg mt-1">
          {tab === 'dm'
            ? 'Schreib einem Freund — er muss deine Anfrage angenommen haben.'
            : 'Tritt einem Event bei, um in den Event-Chat zu kommen.'}
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
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
}
