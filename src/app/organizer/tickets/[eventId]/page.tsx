'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Event } from '@/types/occuro';
import { formatDate, formatTime } from '@/lib/utils';
import {
  ArrowLeft, ImageOff, Check, X, Loader2, AlertCircle,
  ScanLine, Ticket as TicketIcon, Search, Filter,
} from 'lucide-react';

interface TicketSubmission {
  id: string;
  event_id: string;
  user_id: string;
  ticket_image_url: string | null;
  verification_status: 'pending' | 'approved' | 'rejected' | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  scanned_at: string | null;
  created_at: string;
}

interface UserInfo {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected' | 'scanned';

export default function EventTicketsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const { user, organization } = useAuth();
  const supabase = createClient();

  const [event, setEvent] = useState<Event | null>(null);
  const [tickets, setTickets] = useState<TicketSubmission[]>([]);
  const [users, setUsers] = useState<Record<string, UserInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('pending');
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const setBusy = (id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    // Fetch the event and verify ownership
    const { data: eventData, error: eventErr } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (eventErr || !eventData) {
      setError('Event nicht gefunden.');
      setLoading(false);
      return;
    }

    const isOwner =
      eventData.organizer_profile_id === user.id ||
      (organization?.id && eventData.organizer_org_id === organization.id);

    if (!isOwner) {
      setError('Du hast keine Berechtigung für die Ticket-Verwaltung dieses Events.');
      setLoading(false);
      return;
    }

    setEvent(eventData as Event);

    // Fetch all tickets for this event
    const { data: ticketRows } = await supabase
      .from('tickets')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    setTickets((ticketRows ?? []) as TicketSubmission[]);

    // Resolve user profiles
    const userIds = [...new Set((ticketRows ?? []).map((t: { user_id: string }) => t.user_id))];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', userIds);
      const map: Record<string, UserInfo> = {};
      (profiles ?? []).forEach((p) => { map[p.id] = p as UserInfo; });
      setUsers(map);
    }

    setLoading(false);
  }, [supabase, user, organization, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Actions ─────────────────────────────────────────────────────
  async function approveTicket(ticketId: string) {
    setBusy(ticketId, true);
    const { error } = await supabase
      .from('tickets')
      .update({
        verification_status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user!.id,
        rejection_reason: null,
      })
      .eq('id', ticketId);
    if (!error) {
      setTickets((prev) => prev.map((t) =>
        t.id === ticketId ? { ...t, verification_status: 'approved', reviewed_at: new Date().toISOString() } : t,
      ));
    }
    setBusy(ticketId, false);
  }

  async function rejectTicket(ticketId: string) {
    const reason = prompt('Grund für Ablehnung (optional):') ?? '';
    setBusy(ticketId, true);
    const { error } = await supabase
      .from('tickets')
      .update({
        verification_status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user!.id,
        rejection_reason: reason || null,
      })
      .eq('id', ticketId);
    if (!error) {
      setTickets((prev) => prev.map((t) =>
        t.id === ticketId ? {
          ...t,
          verification_status: 'rejected',
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason || null,
        } : t,
      ));
    }
    setBusy(ticketId, false);
  }

  async function markScanned(ticketId: string) {
    if (!confirm('Ticket als gescannt markieren? Damit ist der Einlass bestätigt.')) return;
    setBusy(ticketId, true);
    const { error } = await supabase
      .from('tickets')
      .update({
        scanned_at: new Date().toISOString(),
        scanned_by: user!.id,
      })
      .eq('id', ticketId);
    if (!error) {
      setTickets((prev) => prev.map((t) =>
        t.id === ticketId ? { ...t, scanned_at: new Date().toISOString() } : t,
      ));
    }
    setBusy(ticketId, false);
  }

  // ── Derived ─────────────────────────────────────────────────────
  const counts = {
    all: tickets.length,
    pending: tickets.filter((t) => t.verification_status === 'pending' || !t.verification_status).length,
    approved: tickets.filter((t) => t.verification_status === 'approved' && !t.scanned_at).length,
    rejected: tickets.filter((t) => t.verification_status === 'rejected').length,
    scanned: tickets.filter((t) => t.scanned_at).length,
  };

  const filtered = tickets.filter((t) => {
    if (filter === 'pending' && !(t.verification_status === 'pending' || !t.verification_status)) return false;
    if (filter === 'approved' && !(t.verification_status === 'approved' && !t.scanned_at)) return false;
    if (filter === 'rejected' && t.verification_status !== 'rejected') return false;
    if (filter === 'scanned' && !t.scanned_at) return false;
    if (search.trim()) {
      const u = users[t.user_id];
      const q = search.trim().toLowerCase();
      const name = (u?.full_name ?? '').toLowerCase();
      const username = (u?.username ?? '').toLowerCase();
      if (!name.includes(q) && !username.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <Link
          href="/organizer/tickets"
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-fg hover:text-foreground transition-colors mb-2"
        >
          <ArrowLeft size={13} /> Alle Events
        </Link>
        {loading ? (
          <div className="h-8 w-64 bg-muted rounded animate-pulse" />
        ) : event ? (
          <>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">{event.title}</h1>
            <p className="text-sm text-muted-fg mt-1">
              {formatDate(event.date)} · {formatTime(event.time)} · {event.location}
            </p>
          </>
        ) : null}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-[14px] font-semibold text-red-300">{error}</p>
        </div>
      )}

      {!error && !loading && (
        <>
          {/* Stat strip */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <StatTile count={counts.pending} label="Offen" accent="amber" />
            <StatTile count={counts.approved} label="Bestätigt" accent="green" />
            <StatTile count={counts.rejected} label="Abgelehnt" accent="red" />
            <StatTile count={counts.scanned} label="Gescannt" accent="neutral" />
            <StatTile count={counts.all} label="Gesamt" accent="muted" />
          </div>

          {/* Filter chips */}
          <div className="flex gap-2 flex-wrap">
            {([
              { key: 'pending' as const, label: 'Offen', count: counts.pending },
              { key: 'approved' as const, label: 'Bestätigt', count: counts.approved },
              { key: 'scanned' as const, label: 'Gescannt', count: counts.scanned },
              { key: 'rejected' as const, label: 'Abgelehnt', count: counts.rejected },
              { key: 'all' as const, label: 'Alle', count: counts.all },
            ]).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all ${
                  filter === f.key
                    ? 'bg-primary-bg text-primary-text shadow-sm'
                    : 'bg-surface border border-border-subtle text-muted-fg hover:text-foreground'
                }`}
              >
                {f.label} <span className="opacity-60">({f.count})</span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-fg" />
            <input
              type="text"
              placeholder="Nach Name oder @username suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-border-subtle bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-focus"
            />
          </div>

          {/* Ticket list */}
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
              <TicketIcon size={36} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">
                {filter === 'pending' ? 'Keine offenen Tickets' :
                 filter === 'approved' ? 'Keine bestätigten Tickets' :
                 filter === 'scanned' ? 'Noch keine Tickets gescannt' :
                 filter === 'rejected' ? 'Keine abgelehnten Tickets' :
                 'Noch keine Tickets eingegangen'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  user={users[ticket.user_id]}
                  busy={busyIds.has(ticket.id)}
                  onApprove={() => approveTicket(ticket.id)}
                  onReject={() => rejectTicket(ticket.id)}
                  onMarkScanned={() => markScanned(ticket.id)}
                  onPreview={() => ticket.ticket_image_url && setPreviewImage(ticket.ticket_image_url)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Image preview modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 animate-fade-in"
          onClick={() => setPreviewImage(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewImage} alt="Ticket" className="max-w-full max-h-full rounded-xl" />
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 backdrop-blur text-white hover:bg-white/20 transition-colors"
            aria-label="Schließen"
          >
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────

function StatTile({
  count, label, accent,
}: {
  count: number;
  label: string;
  accent: 'amber' | 'green' | 'red' | 'neutral' | 'muted';
}) {
  const palette = {
    amber: 'text-amber-400',
    green: 'text-green-400',
    red: 'text-red-400',
    neutral: 'text-foreground',
    muted: 'text-foreground/70',
  }[accent];
  return (
    <div className="p-3 rounded-2xl border border-border-subtle bg-surface text-center">
      <p className={`text-xl font-heading font-bold ${palette}`}>{count}</p>
      <p className="text-[10px] sm:text-[11px] font-medium text-muted-fg uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

function TicketCard({
  ticket, user, busy, onApprove, onReject, onMarkScanned, onPreview,
}: {
  ticket: TicketSubmission;
  user?: UserInfo;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onMarkScanned: () => void;
  onPreview: () => void;
}) {
  const status = ticket.scanned_at
    ? { label: 'Gescannt', className: 'bg-muted text-foreground border-border-strong' }
    : ticket.verification_status === 'approved'
      ? { label: 'Bestätigt', className: 'bg-green-500/15 text-green-400 border-green-500/30' }
      : ticket.verification_status === 'rejected'
        ? { label: 'Abgelehnt', className: 'bg-red-500/15 text-red-400 border-red-500/30' }
        : { label: 'Offen', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };

  const isPending = !ticket.verification_status || ticket.verification_status === 'pending';
  const isApprovedNotScanned = ticket.verification_status === 'approved' && !ticket.scanned_at;

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 rounded-2xl border border-border-subtle bg-surface ${busy ? 'opacity-60' : ''}`}>
      {/* Ticket thumbnail */}
      <button
        onClick={onPreview}
        disabled={!ticket.ticket_image_url}
        className="w-full sm:w-20 h-20 rounded-lg bg-elevated overflow-hidden flex-shrink-0 hover:opacity-80 transition-opacity"
      >
        {ticket.ticket_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ticket.ticket_image_url} alt="Ticket" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageOff size={18} className="text-muted-fg/30" />
          </div>
        )}
      </button>

      {/* User + status */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
            {user?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[10px] font-semibold text-foreground/70">
                {(user?.full_name ?? '?').charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold truncate">{user?.full_name ?? 'Unbekannt'}</p>
            {user?.username && <p className="text-[11px] text-muted-fg truncate">@{user.username}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-xl text-[10px] font-semibold border ${status.className}`}>
            {status.label}
          </span>
          {ticket.rejection_reason && (
            <span className="text-[11px] text-muted-fg italic">Grund: {ticket.rejection_reason}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-shrink-0">
        {isPending && (
          <>
            <button
              onClick={onApprove}
              disabled={busy}
              className="flex-1 sm:flex-initial px-3 py-2 rounded-xl text-[12px] font-semibold bg-green-600 text-white hover:bg-green-500 transition-colors flex items-center justify-center gap-1.5"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Bestätigen
            </button>
            <button
              onClick={onReject}
              disabled={busy}
              className="flex-1 sm:flex-initial px-3 py-2 rounded-xl text-[12px] font-semibold border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors flex items-center justify-center gap-1.5"
            >
              <X size={13} />
              Ablehnen
            </button>
          </>
        )}
        {isApprovedNotScanned && (
          <button
            onClick={onMarkScanned}
            disabled={busy}
            className="flex-1 sm:flex-initial px-3 py-2 rounded-xl text-[12px] font-semibold bg-primary-bg text-primary-text hover:bg-primary-hover transition-colors flex items-center justify-center gap-1.5"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ScanLine size={13} />}
            Eingelassen
          </button>
        )}
      </div>
    </div>
  );
}
