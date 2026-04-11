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
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .not('type', 'in', '("chat_message","chat_announcement")')
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifications((data ?? []) as AppNotification[]);
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime — refetch on any insert/update/delete on the user's notifications.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
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
    return () => {
      void supabase.removeChannel(channel);
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
