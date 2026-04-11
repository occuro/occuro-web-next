'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

/**
 * Loads the current user's recent notifications and exposes mark-as-read,
 * mark-all-as-read, and delete actions. Subscribes to Supabase Realtime
 * so the bell badge updates instantly when a new notification lands.
 *
 * Excludes chat notifications by default — those have their own UI in
 * the chat list and would otherwise spam the bell.
 */
export function useNotifications(userId: string | null | undefined) {
  const supabase = createClient();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Wrap the whole query in try/catch — a network error or transient
    // RLS issue must NOT crash the global sidebar bell. Worst case the
    // bell shows zero notifications until the next reload.
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .not('type', 'in', '("chat_message","chat_announcement")')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        console.warn('[useNotifications] load failed:', error.message);
        setNotifications([]);
      } else {
        setNotifications((data ?? []) as AppNotification[]);
      }
    } catch (e) {
      console.warn('[useNotifications] load threw:', e);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime — refetch on any insert/update/delete on the user's notifications.
  // Wrapped in try/catch so a misconfigured channel never crashes the app.
  useEffect(() => {
    if (!userId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          () => { void load(); },
        )
        .subscribe();
    } catch (e) {
      console.warn('[useNotifications] realtime subscribe failed:', e);
    }
    return () => {
      try {
        if (channel) void supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [supabase, userId, load]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await supabase.from('notifications').update({ read: true }).eq('id', id);
  }, [supabase]);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
  }, [supabase, userId]);

  const deleteNotification = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await supabase.from('notifications').delete().eq('id', id);
  }, [supabase]);

  const deleteAll = useCallback(async () => {
    if (!userId) return;
    setNotifications([]);
    await supabase.from('notifications').delete().eq('user_id', userId);
  }, [supabase, userId]);

  return {
    notifications,
    loading,
    unreadCount,
    reload: load,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAll,
  };
}
