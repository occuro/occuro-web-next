'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatDate, formatTime } from '@/lib/utils';
import {
  Ticket, Clock, CheckCircle2, XCircle, ScanLine, ImageOff,
  X, MapPin, Calendar, AlertTriangle, Loader2,
} from 'lucide-react';
import Link from 'next/link';

interface TicketEvent {
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  time: string;
  location: string;
  image_url: string | null;
  banner_url: string | null;
  ticket_image_url?: string | null;
  ticket_scanned_at?: string | null;
  ticket_verification_status?: 'pending' | 'approved' | 'rejected' | null;
}

type Tab = 'upcoming' | 'past';

export default function WalletPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [selected, setSelected] = useState<TicketEvent | null>(null);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (user) void fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchTickets() {
    setLoading(true);
    // Get all events the user has a ticket for. We pull from `tickets`
    // first since that's the source of truth, then enrich with the event.
    const { data: ticketRows } = await supabase
      .from('tickets')
      .select('event_id, ticket_image_url, scanned_at, verification_status')
      .eq('user_id', user!.id);

    const ticketIds = (ticketRows ?? []).map((t: { event_id: string }) => t.event_id);
    if (ticketIds.length === 0) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const { data: eventRows } = await supabase
      .from('events')
      .select('id, title, date, end_date, time, location, image_url, banner_url')
      .in('id', ticketIds);

    const ticketMap = new Map(
      (ticketRows ?? []).map((t: { event_id: string; ticket_image_url: string | null; scanned_at: string | null; verification_status: string | null }) => [
        t.event_id,
        t,
      ]),
    );

    const enriched: TicketEvent[] = (eventRows ?? []).map((e: TicketEvent) => {
      const t = ticketMap.get(e.id);
      return {
        ...e,
        ticket_image_url: (t?.ticket_image_url as string | null) ?? null,
        ticket_scanned_at: (t?.scanned_at as string | null) ?? null,
        ticket_verification_status: (t?.verification_status as TicketEvent['ticket_verification_status']) ?? null,
      };
    });
    setEvents(enriched);
    setLoading(false);
  }

  const { upcoming, past } = useMemo(() => {
    const u: TicketEvent[] = [];
    const p: TicketEvent[] = [];
    events.forEach((e) => {
      const isScanned = Boolean(e.ticket_scanned_at);
      const endDate = e.end_date ?? e.date;
      if (!isScanned && endDate >= today) u.push(e);
      else p.push(e);
    });
    u.sort((a, b) => a.date.localeCompare(b.date));
    p.sort((a, b) => b.date.localeCompare(a.date));
    return { upcoming: u, past: p };
  }, [events, today]);

  const currentList = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">Wallet</h1>
        <p className="text-sm text-muted-fg mt-1">Deine Tickets und Eintrittskarten</p>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile count={upcoming.length} label="Aktiv" icon={Ticket} accent="violet" />
        <StatTile
          count={events.filter((e) => e.ticket_scanned_at).length}
          label="Gescannt"
          icon={ScanLine}
          accent="green"
        />
        <StatTile count={past.length} label="Vergangen" icon={Clock} accent="muted" />
      </div>

      {/* Tabs */}
      <div className="flex rounded-2xl bg-muted p-1">
        <TabButton active={tab === 'upcoming'} onClick={() => setTab('upcoming')} label="Bevorstehend" count={upcoming.length} />
        <TabButton active={tab === 'past'} onClick={() => setTab('past')} label="Vergangen" count={past.length} />
      </div>

      {/* Ticket list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-surface border border-border-subtle animate-pulse" />
          ))}
        </div>
      ) : currentList.length === 0 ? (
        <div className="text-center py-16 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
          <Ticket size={36} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">
            {tab === 'upcoming' ? 'Keine bevorstehenden Tickets' : 'Keine vergangenen Tickets'}
          </p>
          <p className="text-[12px] text-muted-fg mt-1">
            {tab === 'upcoming'
              ? 'Tickets erscheinen hier sobald du welche hochlädst.'
              : 'Hier landen deine Tickets nach dem Event.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 stagger-children">
          {currentList.map((event) => (
            <TicketRow
              key={event.id}
              event={event}
              today={today}
              dimmed={tab === 'past'}
              onPress={() => setSelected(event)}
            />
          ))}
        </div>
      )}

      {/* Fullscreen ticket detail modal */}
      {selected && (
        <TicketDetailModal event={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────

function StatTile({
  count, label, icon: Icon, accent,
}: {
  count: number;
  label: string;
  icon: typeof Ticket;
  accent: 'violet' | 'green' | 'muted';
}) {
  const palette = {
    violet: { bg: 'bg-violet-500/10', text: 'text-violet-400' },
    green: { bg: 'bg-green-500/10', text: 'text-green-400' },
    muted: { bg: 'bg-muted', text: 'text-muted-fg' },
  }[accent];
  return (
    <div className="p-3 sm:p-4 rounded-2xl border border-border-subtle bg-surface">
      <div className={`w-8 h-8 rounded-lg ${palette.bg} flex items-center justify-center mb-2`}>
        <Icon size={15} className={palette.text} />
      </div>
      <p className="text-xl sm:text-2xl font-heading font-bold tracking-tight">{count}</p>
      <p className="text-[10px] sm:text-[11px] font-medium text-muted-fg uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 ${
        active ? 'bg-surface text-foreground shadow-sm' : 'text-muted-fg hover:text-foreground'
      }`}
    >
      {label}
      <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${active ? 'bg-elevated' : 'bg-elevated/50'}`}>{count}</span>
    </button>
  );
}

interface StatusBadgeConfig {
  label: string;
  icon: typeof Ticket;
  className: string;
}

function getStatus(event: TicketEvent, today: string): StatusBadgeConfig {
  if (event.ticket_scanned_at) {
    return { label: 'Gescannt', icon: ScanLine, className: 'bg-green-500/15 text-green-400 border-green-500/30' };
  }
  const endDate = event.end_date ?? event.date;
  if (endDate < today) {
    return { label: 'Vergangen', icon: Clock, className: 'bg-muted text-muted-fg border-border-subtle' };
  }
  if (event.ticket_verification_status === 'approved') {
    return { label: 'Bestätigt', icon: CheckCircle2, className: 'bg-green-500/15 text-green-400 border-green-500/30' };
  }
  if (event.ticket_verification_status === 'rejected') {
    return { label: 'Abgelehnt', icon: XCircle, className: 'bg-red-500/15 text-red-400 border-red-500/30' };
  }
  if (event.ticket_verification_status === 'pending') {
    return { label: 'In Prüfung', icon: Clock, className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
  }
  return { label: 'Aktiv', icon: Ticket, className: 'bg-violet-500/15 text-violet-400 border-violet-500/30' };
}

function TicketRow({
  event, today, dimmed, onPress,
}: {
  event: TicketEvent;
  today: string;
  dimmed?: boolean;
  onPress: () => void;
}) {
  const status = getStatus(event, today);
  const StatusIcon = status.icon;
  return (
    <button
      onClick={onPress}
      className={`group w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl border border-border-subtle bg-surface hover:bg-elevated/50 hover:border-border-strong transition-all duration-200 text-left ${
        dimmed ? 'opacity-70' : ''
      }`}
    >
      <div className="w-14 h-14 rounded-xl bg-muted overflow-hidden flex-shrink-0">
        {event.banner_url || event.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.banner_url ?? event.image_url ?? ''} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageOff size={18} strokeWidth={1.4} className="text-muted-fg/30" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-[14px] truncate">{event.title}</h3>
        <p className="text-[12px] text-muted-fg mt-0.5 flex items-center gap-1">
          <Calendar size={11} className="flex-shrink-0" />
          {formatDate(event.date)} · {formatTime(event.time)}
        </p>
        <p className="text-[12px] text-muted-fg truncate flex items-center gap-1">
          <MapPin size={11} className="flex-shrink-0" />
          {event.location}
        </p>
      </div>
      <span className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border flex-shrink-0 ${status.className}`}>
        <StatusIcon size={11} />
        {status.label}
      </span>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────
// Fullscreen ticket detail
// ────────────────────────────────────────────────────────────────────

function TicketDetailModal({ event, onClose }: { event: TicketEvent; onClose: () => void }) {
  const today = new Date().toISOString().split('T')[0];
  const status = getStatus(event, today);
  const StatusIcon = status.icon;
  const [imgLoading, setImgLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full sm:max-w-md max-h-[95vh] bg-surface rounded-t-3xl sm:rounded-3xl border border-border-subtle flex flex-col overflow-hidden">
        {/* Drag handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 rounded-full bg-muted" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <h2 className="text-base font-heading font-bold truncate flex-1 mr-2">{event.title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-elevated transition-colors flex-shrink-0"
            aria-label="Schließen"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scroll body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Status badge */}
          <div className="flex justify-center">
            <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border ${status.className}`}>
              <StatusIcon size={13} />
              {status.label}
            </span>
          </div>

          {/* Ticket image */}
          <div className="rounded-2xl border border-border-subtle bg-elevated overflow-hidden">
            {event.ticket_image_url && !imgError ? (
              <div className="relative">
                {imgLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 size={20} className="animate-spin text-muted-fg" />
                  </div>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={event.ticket_image_url}
                  alt="Ticket"
                  className="w-full max-h-[60vh] object-contain"
                  onLoad={() => setImgLoading(false)}
                  onError={() => { setImgError(true); setImgLoading(false); }}
                />
              </div>
            ) : (
              <div className="aspect-[3/4] flex flex-col items-center justify-center text-muted-fg gap-2">
                <AlertTriangle size={28} strokeWidth={1.4} className="opacity-50" />
                <p className="text-[12px]">Ticket-Bild nicht verfügbar</p>
              </div>
            )}
          </div>

          {/* Event info */}
          <div className="space-y-2">
            <InfoRow icon={Calendar} label="Datum" value={`${formatDate(event.date)} · ${formatTime(event.time)}`} />
            <InfoRow icon={MapPin} label="Ort" value={event.location} />
          </div>

          <Link
            href={`/app/event/${event.id}`}
            className="block text-center text-[13px] font-semibold text-violet-400 hover:text-violet-300 transition-colors py-2"
          >
            Event-Details öffnen →
          </Link>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-elevated/50">
      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
        <Icon size={13} className="text-muted-fg" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-muted-fg uppercase tracking-wider">{label}</p>
        <p className="text-[13px] mt-0.5 break-words">{value}</p>
      </div>
    </div>
  );
}
