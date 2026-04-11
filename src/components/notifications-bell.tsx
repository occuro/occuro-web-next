'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useNotifications, type AppNotification } from '@/lib/hooks/useNotifications';
import {
  Bell, BellOff, Check, X, Trash2, UserPlus, Calendar,
  Megaphone, AlertCircle, Ticket, Heart, Award, Users,
} from 'lucide-react';

/**
 * Bell icon with unread badge + click-to-open dropdown panel.
 * Used in the sidebar (desktop) and mobile top bar.
 */
export function NotificationsBell() {
  const { user } = useAuth();
  const {
    notifications, unreadCount, loading,
    markAsRead, markAllAsRead, deleteNotification, deleteAll,
  } = useNotifications(user?.id);

  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-xl hover:bg-muted transition-colors"
        aria-label={`Benachrichtigungen${unreadCount > 0 ? ` (${unreadCount} ungelesen)` : ''}`}
      >
        <Bell size={18} strokeWidth={1.8} className="text-foreground/80" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-violet-600 flex items-center justify-center ring-2 ring-surface">
            <span className="text-[10px] font-bold text-white leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          </span>
        )}
      </button>

      {open && (
        <NotificationsPanel
          notifications={notifications}
          loading={loading}
          unreadCount={unreadCount}
          onClose={() => setOpen(false)}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onDeleteNotification={deleteNotification}
          onDeleteAll={deleteAll}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Dropdown panel
// ────────────────────────────────────────────────────────────────────

interface PanelProps {
  notifications: AppNotification[];
  loading: boolean;
  unreadCount: number;
  onClose: () => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDeleteNotification: (id: string) => void;
  onDeleteAll: () => void;
}

function NotificationsPanel({
  notifications, loading, unreadCount, onClose,
  onMarkAsRead, onMarkAllAsRead, onDeleteNotification, onDeleteAll,
}: PanelProps) {
  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="lg:hidden fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      <div
        className="
          fixed inset-x-2 top-16 z-50 max-h-[80vh]
          lg:absolute lg:inset-x-auto lg:top-full lg:right-0 lg:mt-2 lg:max-h-[640px] lg:w-[380px]
          rounded-2xl border border-border-subtle bg-surface shadow-2xl shadow-black/40
          flex flex-col overflow-hidden animate-fade-in
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <h3 className="text-[14px] font-semibold">Benachrichtigungen</h3>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllAsRead}
                className="text-[11px] font-medium text-violet-400 hover:text-violet-300 px-2 py-1 rounded-lg hover:bg-elevated transition-colors"
              >
                Alle gelesen
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={onDeleteAll}
                className="p-1.5 rounded-lg text-muted-fg hover:text-red-400 hover:bg-red-500/5 transition-colors"
                aria-label="Alle löschen"
                title="Alle löschen"
              >
                <Trash2 size={13} />
              </button>
            )}
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg hover:bg-elevated transition-colors"
              aria-label="Schließen"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-elevated animate-pulse" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12 px-4">
              <BellOff size={28} strokeWidth={1.4} className="text-muted-fg/40 mx-auto mb-2" />
              <p className="text-[13px] font-medium text-muted-fg">Keine Benachrichtigungen</p>
              <p className="text-[11px] text-muted-fg/70 mt-1">Du bist auf dem Laufenden.</p>
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {notifications.map((notif) => (
                <NotificationRow
                  key={notif.id}
                  notification={notif}
                  onMarkAsRead={onMarkAsRead}
                  onDelete={onDeleteNotification}
                  onClose={onClose}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Single row
// ────────────────────────────────────────────────────────────────────

function NotificationRow({
  notification, onMarkAsRead, onDelete, onClose,
}: {
  notification: AppNotification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { icon: Icon, accent } = iconForType(notification.type);
  const data = notification.data ?? {};
  const eventId = (data.eventId ?? data.event_id) as string | undefined;
  const friendId = (data.friend_id ?? data.friendId) as string | undefined;
  const profileId = (data.profile_id ?? data.profileId) as string | undefined;

  // Build the deep link for this notification
  let href: string | null = null;
  if (eventId) href = `/app/event/${eventId}`;
  else if (friendId || profileId) href = '/app/friends';

  function handleClick() {
    if (!notification.read) onMarkAsRead(notification.id);
    onClose();
    if (href) router.push(href);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    onDelete(notification.id);
  }

  return (
    <div
      className={`group flex items-start gap-3 px-4 py-3 hover:bg-elevated/40 transition-colors cursor-pointer ${
        !notification.read ? 'bg-violet-500/[0.04]' : ''
      }`}
      onClick={handleClick}
    >
      {/* Icon */}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${accent}`}>
        <Icon size={15} strokeWidth={2} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p className={`text-[13px] leading-snug flex-1 ${!notification.read ? 'font-semibold' : 'font-medium'}`}>
            {notification.title}
          </p>
          {!notification.read && (
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 mt-1.5 flex-shrink-0" />
          )}
        </div>
        {notification.body && (
          <p className="text-[12px] text-muted-fg mt-0.5 line-clamp-2">{notification.body}</p>
        )}
        <p className="text-[10px] text-muted-fg/70 mt-1">
          {timeAgo(notification.created_at)}
        </p>
      </div>

      {/* Delete button (hover-only on desktop, always on mobile) */}
      <button
        onClick={handleDelete}
        className="p-1.5 rounded-lg text-muted-fg/40 hover:text-red-400 hover:bg-red-500/5 transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100 flex-shrink-0"
        aria-label="Löschen"
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function iconForType(type: string): { icon: typeof Bell; accent: string } {
  // Each notification type gets its own icon + tinted background.
  switch (type) {
    case 'friend_request':
    case 'friend_accepted':
      return { icon: UserPlus, accent: 'bg-violet-500/15 text-violet-400' };
    case 'event_reminder':
      return { icon: Calendar, accent: 'bg-blue-500/15 text-blue-400' };
    case 'event_updated':
    case 'event_cancelled':
      return { icon: AlertCircle, accent: 'bg-amber-500/15 text-amber-400' };
    case 'organizer_new_event':
      return { icon: Megaphone, accent: 'bg-pink-500/15 text-pink-400' };
    case 'ticket_approved':
      return { icon: Check, accent: 'bg-green-500/15 text-green-400' };
    case 'ticket_rejected':
      return { icon: X, accent: 'bg-red-500/15 text-red-400' };
    case 'event_invitation':
    case 'event_rsvp':
      return { icon: Heart, accent: 'bg-pink-500/15 text-pink-400' };
    case 'giveaway_won':
      return { icon: Award, accent: 'bg-violet-500/15 text-violet-400' };
    case 'lineup_invitation':
      return { icon: Ticket, accent: 'bg-violet-500/15 text-violet-400' };
    case 'organizer_new_follower':
    case 'org_milestone':
      return { icon: Users, accent: 'bg-violet-500/15 text-violet-400' };
    default:
      return { icon: Bell, accent: 'bg-muted text-muted-fg' };
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Jetzt';
  if (mins < 60) return `vor ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Gestern';
  if (days < 7) return `vor ${days}d`;
  return new Date(dateStr).toLocaleDateString('de-DE');
}
