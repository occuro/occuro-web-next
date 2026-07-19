'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useNotifications, type AppNotification } from '@/lib/hooks/useNotifications';
import {
  Bell, BellOff, Check, X, Trash2, UserPlus, Calendar, Megaphone,
  AlertCircle, Ticket, Heart, Award, Users,
} from 'lucide-react';

type Tab = 'all' | 'unread';

/**
 * Full-page notifications view, used by both /app/notifications (users)
 * and /organizer/notifications (organizers). Replaces the old bell
 * dropdown — gives the user a proper inbox with tabs and bulk actions.
 */
export function NotificationsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const {
    notifications, loading, unreadCount,
    markAsRead, markAllAsRead, deleteNotification, deleteAll,
  } = useNotifications(user?.id);
  const [tab, setTab] = useState<Tab>('all');

  const filtered = tab === 'unread'
    ? notifications.filter((n) => !n.read)
    : notifications;

  async function handleClick(notif: AppNotification) {
    // AWAIT the mark-as-read before navigating — fire-and-forget here
    // would let the navigation start before the DB write committed,
    // and the in-flight UPDATE could be aborted by the page transition.
    // The result was that the sidebar Benachrichtigungen badge stayed
    // stuck on the unread state.
    if (!notif.read) {
      try {
        await markAsRead(notif.id);
      } catch (e) {
        console.warn('[notifications] markAsRead failed:', e);
      }
    }
    const data = notif.data ?? {};
    const eventId = (data.eventId ?? data.event_id) as string | undefined;
    const friendId = (data.friend_id ?? data.friendId) as string | undefined;
    const profileId = (data.profile_id ?? data.profileId) as string | undefined;
    if (eventId) router.push(`/app/event/${eventId}`);
    else if (friendId || profileId) router.push('/app/friends');
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 sm:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">Benachrichtigungen</h1>
          <p className="text-sm text-muted-fg mt-1">
            {unreadCount > 0
              ? `${unreadCount} ungelesene ${unreadCount === 1 ? 'Benachrichtigung' : 'Benachrichtigungen'}`
              : 'Du bist auf dem Laufenden'}
          </p>
        </div>
        {notifications.length > 0 && (
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium border border-border-subtle hover:bg-elevated transition-colors"
              >
                <Check size={12} /> Alle gelesen
              </button>
            )}
            <button
              onClick={() => {
                if (confirm('Alle Benachrichtigungen löschen?')) deleteAll();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium border border-border-subtle text-muted-fg hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5 transition-colors"
            >
              <Trash2 size={12} /> Alle löschen
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      {notifications.length > 0 && (
        <div className="flex rounded-2xl bg-muted p-1 max-w-xs">
          <button
            onClick={() => setTab('all')}
            className={`flex-1 py-2 rounded-xl text-[12px] font-medium transition-all ${
              tab === 'all' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-fg hover:text-foreground'
            }`}
          >
            Alle ({notifications.length})
          </button>
          <button
            onClick={() => setTab('unread')}
            className={`flex-1 py-2 rounded-xl text-[12px] font-medium transition-all ${
              tab === 'unread' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-fg hover:text-foreground'
            }`}
          >
            Ungelesen{unreadCount > 0 ? ` (${unreadCount})` : ''}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-surface border border-border-subtle animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
          <BellOff size={36} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">
            {tab === 'unread' ? 'Keine ungelesenen Benachrichtigungen' : 'Noch keine Benachrichtigungen'}
          </p>
          <p className="text-[12px] text-muted-fg mt-1">
            {tab === 'unread' ? 'Du bist auf dem Laufenden.' : 'Hier landen Anfragen, Event-Updates und mehr.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border-subtle bg-surface overflow-hidden divide-y divide-border-subtle">
          {filtered.map((notif) => (
            <NotificationRow
              key={notif.id}
              notification={notif}
              onClick={() => handleClick(notif)}
              onDelete={() => deleteNotification(notif.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Single row
// ────────────────────────────────────────────────────────────────────

function NotificationRow({
  notification, onClick, onDelete,
}: {
  notification: AppNotification;
  onClick: () => void;
  onDelete: () => void;
}) {
  const { icon: Icon, accent } = iconForType(notification.type);
  return (
    <div
      className={`group flex items-start gap-3 sm:gap-4 px-4 sm:px-5 py-4 cursor-pointer transition-colors ${
        !notification.read ? 'bg-foreground/[0.04] hover:bg-foreground/[0.05]' : 'hover:bg-elevated/40'
      }`}
      onClick={onClick}
    >
      {/* Icon tile */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${accent}`}>
        <Icon size={16} strokeWidth={2} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p className={`text-[14px] leading-snug flex-1 ${!notification.read ? 'font-bold' : 'font-medium'}`}>
            {notification.title}
          </p>
          {!notification.read && (
            <span className="w-2 h-2 rounded-full bg-foreground mt-1.5 flex-shrink-0" />
          )}
        </div>
        {notification.body && (
          <p className="text-[12px] text-muted-fg mt-0.5 line-clamp-2">{notification.body}</p>
        )}
        <p className="text-[10px] text-muted-fg/70 mt-1.5">
          {timeAgo(notification.created_at)}
        </p>
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="p-1.5 rounded-lg text-muted-fg/40 hover:text-red-400 hover:bg-red-500/5 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex-shrink-0"
        aria-label="Löschen"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function iconForType(type: string): { icon: typeof Bell; accent: string } {
  switch (type) {
    case 'friend_request':
    case 'friend_accepted':
      return { icon: UserPlus, accent: 'bg-muted text-foreground' };
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
      return { icon: Award, accent: 'bg-muted text-foreground' };
    case 'lineup_invitation':
      return { icon: Ticket, accent: 'bg-muted text-foreground' };
    case 'organizer_new_follower':
    case 'org_milestone':
      return { icon: Users, accent: 'bg-muted text-foreground' };
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
