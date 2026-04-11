'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import {
  ArrowLeft, Send, Loader2, Lock, ImageOff, MoreVertical, User, Users, Megaphone,
  UserCircle2, Flag, Ban,
} from 'lucide-react';
import { ReportModal } from '@/components/report-modal';

interface ChatThreadProps {
  roomId: string;
  /** Where the back button leads (the conversation list path). */
  backHref: string;
}

interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  message_type: 'text' | 'image' | 'system';
  image_url: string | null;
  is_encrypted: boolean | null;
  notification_preview: string | null;
  reply_to_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

interface SenderProfile {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export function ChatThread({ roomId, backHref }: ChatThreadProps) {
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, SenderProfile>>({});
  const [room, setRoom] = useState<{ id: string; type: string; title: string | null; event_id: string | null } | null>(null);
  const [otherUser, setOtherUser] = useState<SenderProfile | null>(null);
  const [eventBannerUrl, setEventBannerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Header menu + profile navigation state ─────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Navigate to the public profile page for a user. Uses the username
  // when set so the URL stays clean, falls back to the user id.
  function openProfile(p: SenderProfile) {
    const slug = p.username?.trim() || p.id;
    router.push(`/app/profile/${slug}`);
  }

  // Close the dropdown menu when clicking anywhere outside it
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  async function handleBlock() {
    if (!user || !otherUser) return;
    if (!confirm(`${otherUser.full_name ?? 'Diesen Nutzer'} wirklich blockieren? Du erhältst keine Nachrichten mehr von dieser Person.`)) {
      return;
    }
    setBlocking(true);
    const { error: blockErr } = await supabase
      .from('user_blocks')
      .insert({ blocker_id: user.id, blocked_id: otherUser.id });
    setBlocking(false);
    if (blockErr) {
      alert(`Blockieren fehlgeschlagen: ${blockErr.message}`);
      return;
    }
    setMenuOpen(false);
    router.push(backHref);
  }

  // ── Load room + messages + profiles ───────────────────────────────
  const loadAll = useCallback(async () => {
    if (!user || !roomId) return;
    setLoading(true);
    setError(null);

    // Verify the user is actually a participant — if not, redirect.
    const { data: participantCheck } = await supabase
      .from('chat_participants')
      .select('role, joined_at, last_read_at')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!participantCheck || participantCheck.role === 'left') {
      setError('Du hast keinen Zugriff auf diesen Chat.');
      setLoading(false);
      return;
    }

    // Load the room metadata
    const { data: roomData } = await supabase
      .from('chat_rooms')
      .select('id, type, title, event_id')
      .eq('id', roomId)
      .single();
    if (!roomData) {
      setError('Chat nicht gefunden.');
      setLoading(false);
      return;
    }
    setRoom(roomData);

    // Load messages (most recent 100)
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('id, room_id, sender_id, content, message_type, image_url, is_encrypted, notification_preview, reply_to_id, edited_at, deleted_at, created_at')
      .eq('room_id', roomId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100);

    // For non-DM rooms, hide messages from before this user joined.
    let visibleMessages = (msgs ?? []) as ChatMessage[];
    if (roomData.type !== 'dm' && participantCheck.joined_at) {
      visibleMessages = visibleMessages.filter((m) => m.created_at >= participantCheck.joined_at);
    }
    visibleMessages.reverse(); // newest at the bottom for the UI
    setMessages(visibleMessages);

    // Load profiles for all unique senders
    const senderIds = [...new Set(visibleMessages.map((m) => m.sender_id))];
    if (senderIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', senderIds);
      const map: Record<string, SenderProfile> = {};
      (profs ?? []).forEach((p) => { map[p.id] = p; });
      setProfiles(map);
    }

    // For DMs: load the other user's profile (might not have sent any message yet)
    if (roomData.type === 'dm') {
      const { data: parts } = await supabase
        .from('chat_participants')
        .select('user_id')
        .eq('room_id', roomId)
        .neq('user_id', user.id);
      const otherId = parts?.[0]?.user_id;
      if (otherId) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, full_name, username, avatar_url')
          .eq('id', otherId)
          .single();
        if (prof) setOtherUser(prof);
      }
    }

    // For event rooms: load the banner image
    if (roomData.event_id && roomData.type !== 'dm') {
      const { data: ev } = await supabase
        .from('events')
        .select('banner_url, image_url')
        .eq('id', roomData.event_id)
        .maybeSingle();
      if (ev) setEventBannerUrl(ev.banner_url ?? ev.image_url ?? null);
    }

    setLoading(false);

    // Mark this room as read for the current user. Awaited so a
    // failure (RLS / network) is logged instead of being lost — without
    // this, the conversation list kept showing unread badges forever.
    try {
      const { error: readErr } = await supabase
        .from('chat_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('room_id', roomId)
        .eq('user_id', user.id);
      if (readErr) console.warn('[chat-thread] mark-as-read failed:', readErr.message);
    } catch (e) {
      console.warn('[chat-thread] mark-as-read threw:', e);
    }
  }, [supabase, user, roomId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Scroll to bottom whenever the message list changes. useLayoutEffect
  // (not useEffect) makes the jump synchronous *before* the browser
  // paints — without it, the user briefly saw the chat scrolled to the
  // top before snapping down. We also re-run on `loading` flipping to
  // false because the messages container only mounts at that point and
  // the scroll height isn't measurable until then.
  useLayoutEffect(() => {
    if (loading) return;
    const el = scrollRef.current;
    if (!el) return;
    // Two scrolls: one immediate, one in the next frame. The first
    // covers the synchronous case; the second covers any late layout
    // shifts (avatars, message images) that change the height after
    // the initial commit.
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [messages, loading]);

  // Realtime: append new messages as they arrive
  useEffect(() => {
    if (!user || !roomId) return;
    const channel = supabase
      .channel(`chat-thread-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          // Make sure we have a profile for the new sender
          if (!profiles[msg.sender_id]) {
            void supabase
              .from('profiles')
              .select('id, full_name, username, avatar_url')
              .eq('id', msg.sender_id)
              .single()
              .then(({ data }) => {
                if (data) setProfiles((prev) => ({ ...prev, [msg.sender_id]: data }));
              });
          }
          // Mark as read since the user is actively viewing the chat
          void supabase
            .from('chat_participants')
            .update({ last_read_at: new Date().toISOString() })
            .eq('room_id', roomId)
            .eq('user_id', user.id);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, user, roomId, profiles]);

  // ── Send a message ────────────────────────────────────────────────
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !roomId || !draft.trim() || sending) return;
    setSending(true);
    const content = draft.trim();
    setDraft('');

    // Insert as PLAINTEXT (is_encrypted=false). Mobile users see this as
    // a regular text message. The web is intentionally not E2E because
    // the private key only lives in the iOS keychain.
    const { error: insertError } = await supabase.from('chat_messages').insert({
      room_id: roomId,
      sender_id: user.id,
      content,
      message_type: 'text',
      is_encrypted: false,
      notification_preview: content.slice(0, 120),
    });
    setSending(false);
    if (insertError) {
      setError(insertError.message);
      setDraft(content); // restore draft on error
      return;
    }
    // Bump room.updated_at so the conversation jumps to the top of the list
    void supabase.from('chat_rooms').update({ updated_at: new Date().toISOString() }).eq('id', roomId);
  }

  // ── Header info ───────────────────────────────────────────────────
  const headerInfo = useMemo(() => {
    if (!room) return null;
    if (room.type === 'dm') {
      return {
        title: otherUser?.full_name ?? 'Chat',
        subtitle: otherUser?.username ? `@${otherUser.username}` : null,
        avatarUrl: otherUser?.avatar_url ?? null,
        icon: User,
      };
    }
    if (room.type === 'organizer_announcement') {
      return {
        title: room.title ?? 'Ankündigungen',
        subtitle: 'Nur Veranstalter können posten',
        avatarUrl: eventBannerUrl,
        icon: Megaphone,
      };
    }
    return {
      title: room.title ?? 'Event-Chat',
      subtitle: 'Gruppen-Chat',
      avatarUrl: eventBannerUrl,
      icon: Users,
    };
  }, [room, otherUser, eventBannerUrl]);

  return (
    // Height: mobile top bar is 56px (h-14), desktop has none — so we
    // subtract 56px on mobile and the desktop layout's p-8 (~64px) above.
    // The dvh unit handles iOS Safari's address bar shrinking correctly.
    <div className="max-w-4xl mx-auto h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-6rem)] flex flex-col animate-fade-in">
      {/* ─── Header ─── */}
      <div className="flex items-center gap-3 px-2 sm:px-0 pb-4 border-b border-border-subtle">
        <button
          onClick={() => router.push(backHref)}
          className="p-2 rounded-full hover:bg-elevated transition-colors"
          aria-label="Zurück"
        >
          <ArrowLeft size={18} />
        </button>
        {headerInfo && (
          <button
            type="button"
            onClick={() => { if (otherUser) openProfile(otherUser); }}
            disabled={!otherUser}
            className="flex items-center gap-3 flex-1 min-w-0 -mx-1 px-1 py-1 rounded-xl hover:bg-elevated/50 transition-colors text-left disabled:cursor-default disabled:hover:bg-transparent"
          >
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
              {headerInfo.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={headerInfo.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <headerInfo.icon size={18} className="text-muted-fg" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-[15px] font-semibold truncate">{headerInfo.title}</h1>
              {headerInfo.subtitle && (
                <p className="text-[11px] text-muted-fg truncate">{headerInfo.subtitle}</p>
              )}
            </div>
          </button>
        )}

        {/* 3-dots dropdown — only meaningful for DMs (where there's a
            single other user we can act on). For event/announcement
            rooms there's nothing to report or block, so the button is
            hidden entirely. */}
        {otherUser && (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="p-2 rounded-full hover:bg-elevated transition-colors"
              aria-label="Mehr"
            >
              <MoreVertical size={18} className="text-muted-fg" />
            </button>
            {menuOpen && (
              <div className="absolute top-full right-0 mt-1 w-56 rounded-2xl border border-border-subtle bg-surface shadow-2xl shadow-black/40 overflow-hidden z-30 animate-fade-in">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); openProfile(otherUser); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-[13px] hover:bg-elevated transition-colors"
                >
                  <UserCircle2 size={15} className="text-muted-fg" />
                  Profil ansehen
                </button>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setReportOpen(true); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-[13px] hover:bg-elevated transition-colors border-t border-border-subtle"
                >
                  <Flag size={15} className="text-amber-400" />
                  Nutzer melden
                </button>
                <button
                  type="button"
                  onClick={handleBlock}
                  disabled={blocking}
                  className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-red-400 hover:bg-red-500/5 transition-colors border-t border-border-subtle disabled:opacity-50"
                >
                  {blocking ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />}
                  Blockieren
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Messages ─── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={20} className="animate-spin text-muted-fg" />
          </div>
        ) : error ? (
          <div className="text-center py-20 text-muted-fg">
            <p className="text-sm">{error}</p>
            <Link href={backHref} className="text-[12px] text-violet-400 hover:underline mt-2 inline-block">
              Zurück zur Übersicht
            </Link>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-20 text-muted-fg">
            <p className="text-sm">Noch keine Nachrichten in diesem Chat.</p>
            <p className="text-[12px] mt-1">Sei der erste, der hallo sagt.</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isOwn = msg.sender_id === user?.id;
            const profile = profiles[msg.sender_id];
            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const showAvatar = !isOwn && (!prevMsg || prevMsg.sender_id !== msg.sender_id);
            const showName = !isOwn && room?.type !== 'dm' && showAvatar;
            return (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isOwn={isOwn}
                profile={profile}
                showAvatar={showAvatar}
                showName={showName}
                onProfileClick={(p) => openProfile(p)}
              />
            );
          })
        )}
      </div>

      {/* ─── Composer ─── */}
      {!error && (
        <form onSubmit={handleSend} className="flex items-center gap-2 px-3 py-3 border-t border-border-subtle">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Nachricht schreiben…"
            disabled={sending || loading}
            className="flex-1 px-4 py-2.5 rounded-full border border-border-subtle bg-elevated text-sm placeholder:text-muted-fg/60 focus:outline-none focus:border-violet-500/40"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending || loading}
            className="w-10 h-10 rounded-full bg-violet-600 text-white flex items-center justify-center hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            aria-label="Senden"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      )}

      {/* ─── Report modal ─── */}
      {otherUser && (
        <ReportModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="profile"
          targetId={otherUser.id}
          targetName={otherUser.full_name ?? undefined}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Message bubble
// ────────────────────────────────────────────────────────────────────

function MessageBubble({
  msg, isOwn, profile, showAvatar, showName, onProfileClick,
}: {
  msg: ChatMessage;
  isOwn: boolean;
  profile?: SenderProfile;
  showAvatar: boolean;
  showName: boolean;
  onProfileClick?: (profile: SenderProfile) => void;
}) {
  // E2E messages: we can't decrypt in the browser, so show the
  // notification_preview if available, otherwise a lock placeholder.
  const isLocked = msg.is_encrypted && !msg.notification_preview;
  const displayContent = isLocked
    ? '🔒 Nachricht ist Ende-zu-Ende verschlüsselt'
    : msg.is_encrypted
      ? msg.notification_preview ?? msg.content
      : msg.content;

  return (
    <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar (only on first msg in a streak from this sender) */}
      {!isOwn && (
        <div className="w-7 h-7 flex-shrink-0">
          {showAvatar && (
            <button
              type="button"
              onClick={() => { if (profile && onProfileClick) onProfileClick(profile); }}
              disabled={!profile || !onProfileClick}
              className="w-7 h-7 rounded-full bg-muted overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-violet-500/40 transition-all"
              aria-label="Profil ansehen"
            >
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] font-semibold text-foreground/70">
                  {(profile?.full_name ?? '?').charAt(0).toUpperCase()}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      <div className={`max-w-[75%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        {showName && profile && (
          <button
            type="button"
            onClick={() => onProfileClick?.(profile)}
            className="text-[10px] font-semibold text-muted-fg px-2 mb-0.5 hover:text-foreground transition-colors text-left"
          >
            {profile.full_name ?? profile.username ?? '?'}
          </button>
        )}
        <div
          className={`px-3.5 py-2 rounded-2xl text-[14px] leading-snug ${
            isOwn
              ? 'bg-violet-600 text-white rounded-br-md'
              : 'bg-elevated border border-border-subtle text-foreground rounded-bl-md'
          } ${isLocked ? 'italic opacity-80' : ''}`}
        >
          {msg.message_type === 'image' && msg.image_url ? (
            <div className="-m-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={msg.image_url} alt="" className="max-w-[280px] rounded-xl" />
            </div>
          ) : msg.message_type === 'image' ? (
            <div className="flex items-center gap-2 text-[12px]">
              <ImageOff size={13} />
              Bild nicht verfügbar
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">{displayContent}</p>
          )}
        </div>
        <span className="text-[9px] text-muted-fg/60 px-2 mt-0.5">
          {new Date(msg.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          {msg.edited_at && ' · bearbeitet'}
        </span>
      </div>
    </div>
  );
}
