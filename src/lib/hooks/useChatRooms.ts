'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type ChatRoomType = 'dm' | 'event_group' | 'organizer_announcement';

export interface ChatRoom {
  id: string;
  type: ChatRoomType;
  title: string | null;
  event_id: string | null;
  updated_at: string;
  last_message_preview: string;
  last_message_at: string | null;
  unread_count: number;
  // For DMs: the other participant's profile
  other_user_id: string | null;
  other_user_name: string | null;
  other_user_username: string | null;
  other_user_avatar: string | null;
  // For event rooms: event banner
  event_banner_url: string | null;
}

interface ChatMessageRow {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  image_url: string | null;
  is_encrypted: boolean | null;
  notification_preview: string | null;
  deleted_at: string | null;
  created_at: string;
}

/**
 * Loads all chat rooms the current user is in, enriched with:
 * - Last message preview (uses notification_preview for E2E messages,
 *   falls back to plaintext content for unencrypted system messages)
 * - Unread count (messages newer than last_read_at, not from self)
 * - DM partner profile (name, username, avatar)
 * - Event banner URL for event rooms
 *
 * Subscribes to Supabase Realtime so the list refreshes when new
 * messages arrive in any of the user's rooms.
 *
 * Note: WebApp does NOT decrypt E2E messages — the private key only
 * lives in the iOS keychain. We rely on `notification_preview` (a short
 * client-provided plaintext snippet) for the list and on a lock icon
 * placeholder when reading individual messages.
 */
export function useChatRooms(userId: string | null | undefined) {
  const supabase = createClient();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRooms = useCallback(async (options?: { background?: boolean }) => {
    if (!userId) {
      setRooms([]);
      setLoading(false);
      return;
    }
    // Only show the skeleton on the very first load (or when we have no
    // rooms yet). Background refetches — triggered by tab-visibility,
    // focus, or realtime events — should NOT flip the list back into
    // skeleton state, otherwise switching browser tabs makes the chat
    // list disappear for several seconds until Supabase answers.
    if (!options?.background) setLoading(true);

    // 1. Find all rooms the user is participant in (excluding 'left')
    const { data: participantRows } = await supabase
      .from('chat_participants')
      .select('room_id, last_read_at, joined_at, role')
      .eq('user_id', userId);

    const activeParticipants = (participantRows ?? []).filter(
      (p: { role?: string | null }) => p.role !== 'left',
    );
    if (activeParticipants.length === 0) {
      setRooms([]);
      setLoading(false);
      return;
    }

    const roomIds = activeParticipants.map((p: { room_id: string }) => p.room_id);
    const lastReadMap = new Map(
      activeParticipants.map((p: { room_id: string; last_read_at: string }) => [p.room_id, p.last_read_at]),
    );
    const joinedAtMap = new Map(
      activeParticipants.map((p: { room_id: string; joined_at: string }) => [p.room_id, p.joined_at]),
    );

    // 2. Fetch rooms + recent messages + DM partners in parallel.
    // We pull a generous slice of recent messages so we can pick the
    // newest one per room locally instead of issuing N queries.
    const oldestLastRead = Array.from(lastReadMap.values()).sort()[0] ?? '1970-01-01';
    const [roomsRes, recentMessagesRes, unreadMessagesRes, dmParticipantsRes] = await Promise.all([
      supabase.from('chat_rooms').select('*').in('id', roomIds).order('updated_at', { ascending: false }),
      supabase
        .from('chat_messages')
        .select('id, room_id, sender_id, content, message_type, image_url, is_encrypted, notification_preview, deleted_at, created_at')
        .in('room_id', roomIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(Math.min(Math.max(roomIds.length * 5, 50), 200)),
      supabase
        .from('chat_messages')
        .select('id, room_id, sender_id, created_at, deleted_at')
        .in('room_id', roomIds)
        .neq('sender_id', userId)
        .is('deleted_at', null)
        .gt('created_at', oldestLastRead),
      supabase
        .from('chat_participants')
        .select('room_id, user_id')
        .in('room_id', roomIds)
        .neq('user_id', userId),
    ]);

    const roomRows = (roomsRes.data ?? []) as Array<{
      id: string;
      type: ChatRoomType;
      title: string | null;
      event_id: string | null;
      updated_at: string;
      created_at: string;
    }>;
    const allMessages = (recentMessagesRes.data ?? []) as ChatMessageRow[];
    const unreadRows = (unreadMessagesRes.data ?? []) as Array<{ room_id: string; sender_id: string; created_at: string }>;
    const dmParticipants = (dmParticipantsRes.data ?? []) as Array<{ room_id: string; user_id: string }>;

    // 3. Build last-message map (newest message per room, respecting joined_at cutoff)
    const lastMessageMap = new Map<string, ChatMessageRow>();
    const roomTypeMap = new Map<string, ChatRoomType>(roomRows.map((r) => [r.id, r.type]));
    for (const msg of allMessages) {
      if (lastMessageMap.has(msg.room_id)) continue;
      const rType = roomTypeMap.get(msg.room_id);
      const joinedAt = joinedAtMap.get(msg.room_id);
      // Non-DM rooms: skip messages from before the user joined
      if (rType !== 'dm' && joinedAt && msg.created_at < joinedAt) continue;
      lastMessageMap.set(msg.room_id, msg);
    }

    // 4. Compute unread counts (per room)
    const unreadCountMap = new Map<string, number>();
    for (const msg of unreadRows) {
      const lastRead = lastReadMap.get(msg.room_id) ?? '1970-01-01';
      if (msg.created_at <= lastRead) continue;
      const rType = roomTypeMap.get(msg.room_id);
      const joinedAt = joinedAtMap.get(msg.room_id);
      if (rType !== 'dm' && joinedAt && msg.created_at < joinedAt) continue;
      unreadCountMap.set(msg.room_id, (unreadCountMap.get(msg.room_id) ?? 0) + 1);
    }

    // 5. Resolve DM partner profiles + event banners in parallel
    const dmRoomIds = roomRows.filter((r) => r.type === 'dm').map((r) => r.id);
    const dmPartsForUs = dmParticipants.filter((p) => dmRoomIds.includes(p.room_id));
    const otherUserIds = [...new Set(dmPartsForUs.map((p) => p.user_id))];

    const eventRoomIds = roomRows.filter((r) => r.event_id && r.type !== 'dm').map((r) => r.event_id!) as string[];
    const uniqueEventIds = [...new Set(eventRoomIds)];

    const [profilesRes, eventBannersRes] = await Promise.all([
      otherUserIds.length > 0
        ? supabase.from('profiles').select('id, full_name, username, avatar_url').in('id', otherUserIds)
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; username: string | null; avatar_url: string | null }> }),
      uniqueEventIds.length > 0
        ? supabase.from('events').select('id, banner_url, image_url').in('id', uniqueEventIds)
        : Promise.resolve({ data: [] as Array<{ id: string; banner_url: string | null; image_url: string | null }> }),
    ]);

    const profileMap = new Map(
      (profilesRes.data ?? []).map((p) => [p.id, p]),
    );
    const eventBannerMap = new Map(
      (eventBannersRes.data ?? []).map((e) => [e.id, e.banner_url ?? e.image_url ?? null]),
    );
    const dmOtherUserByRoom = new Map<string, { id: string; full_name: string | null; username: string | null; avatar_url: string | null }>();
    for (const p of dmPartsForUs) {
      const prof = profileMap.get(p.user_id);
      if (prof) dmOtherUserByRoom.set(p.room_id, prof);
    }

    // 6. Build ChatRoom objects
    const enriched: ChatRoom[] = roomRows.map((room) => {
      const lastMsg = lastMessageMap.get(room.id);
      const otherUser = dmOtherUserByRoom.get(room.id);
      const eventBanner = room.event_id ? eventBannerMap.get(room.event_id) ?? null : null;

      let preview = '';
      if (lastMsg) {
        if (lastMsg.message_type === 'image') {
          preview = '📷 Bild';
        } else if (lastMsg.notification_preview) {
          preview = lastMsg.notification_preview;
        } else if (lastMsg.is_encrypted) {
          preview = '🔒 Verschlüsselte Nachricht';
        } else {
          preview = lastMsg.content.length > 80 ? `${lastMsg.content.slice(0, 80)}…` : lastMsg.content;
        }
      } else {
        preview = 'Noch keine Nachrichten';
      }

      return {
        id: room.id,
        type: room.type,
        title: room.title,
        event_id: room.event_id,
        updated_at: room.updated_at,
        last_message_preview: preview,
        last_message_at: lastMsg?.created_at ?? null,
        unread_count: unreadCountMap.get(room.id) ?? 0,
        other_user_id: otherUser?.id ?? null,
        other_user_name: otherUser?.full_name ?? null,
        other_user_username: otherUser?.username ?? null,
        other_user_avatar: otherUser?.avatar_url ?? null,
        event_banner_url: eventBanner,
      };
    });

    // 7. Sort by last activity (last message time wins, falls back to room.updated_at)
    enriched.sort((a, b) => {
      const aTime = a.last_message_at ?? a.updated_at;
      const bTime = b.last_message_at ?? b.updated_at;
      return bTime.localeCompare(aTime);
    });

    setRooms(enriched);
    setLoading(false);
  }, [supabase, userId]);

  // Initial load
  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  // Reload whenever the tab regains focus / becomes visible. Without
  // this the conversation list keeps its cached unread counts when the
  // user navigates back from a chat detail page (Next.js client-side
  // navigation doesn't unmount the list), so messages they just read
  // stay highlighted as unread until a manual reload.
  useEffect(() => {
    if (!userId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadRooms({ background: true });
    };
    const onFocus = () => { void loadRooms({ background: true }); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [userId, loadRooms]);

  // Realtime: refetch on any new message in the user's rooms AND on
  // any update to the current user's chat_participants row (which is
  // how last_read_at gets cleared when they open a chat). The
  // participants subscription is what causes the unread badge to
  // disappear after the user reads a thread, even if Next.js client
  // navigation kept the list page mounted in the background.
  useEffect(() => {
    if (!userId) return;
    let pending = false;
    const trigger = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        void loadRooms({ background: true });
      });
    };
    const channel = supabase
      .channel(`chat-rooms-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        trigger,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_participants',
          filter: `user_id=eq.${userId}`,
        },
        trigger,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, loadRooms]);

  return { rooms, loading, reload: loadRooms };
}
