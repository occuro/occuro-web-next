'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatDate, formatTime } from '@/lib/utils';
import { Ticket, Clock, CheckCircle2, XCircle, ChevronDown, ChevronUp, ScanLine, ImageOff } from 'lucide-react';

interface TicketEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  image_url: string | null;
  ticket_image_url?: string | null;
  ticket_scanned_at?: string | null;
  ticket_verification_status?: string | null;
}

export default function WalletPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpcoming, setShowUpcoming] = useState(true);
  const [showHistory, setShowHistory] = useState(true);
  const supabase = createClient();

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (user) fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchTickets() {
    // Fetch events where user has a ticket
    const { data } = await supabase
      .from('event_statuses')
      .select('event_id, events(*)')
      .eq('user_id', user!.id)
      .not('events.ticket_image_url', 'is', null);

    const ticketEvents = (data ?? [])
      .map((d: any) => d.events)
      .filter(Boolean) as TicketEvent[];

    setEvents(ticketEvents);
    setLoading(false);
  }

  const upcoming = events.filter((e) => e.date >= today && !e.ticket_scanned_at);
  const history = events.filter((e) => e.date < today || !!e.ticket_scanned_at);

  const statusConfig = (event: TicketEvent) => {
    if (event.ticket_scanned_at) return { label: 'Gescannt', icon: ScanLine, color: 'bg-green-50 text-green-700 border-green-200' };
    if (event.date < today) return { label: 'Vergangen', icon: Clock, color: 'bg-muted text-muted-fg border-border-subtle' };
    if (event.ticket_verification_status === 'approved') return { label: 'Bestätigt', icon: CheckCircle2, color: 'bg-green-50 text-green-700 border-green-200' };
    if (event.ticket_verification_status === 'rejected') return { label: 'Abgelehnt', icon: XCircle, color: 'bg-red-50 text-red-700 border-red-200' };
    return { label: 'Aktiv', icon: Ticket, color: 'bg-blue-50 text-blue-700 border-blue-200' };
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight">Wallet</h1>
        <p className="text-sm text-muted-fg mt-1">Deine Tickets und Eintrittskarten</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl border border-border-subtle bg-surface">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Clock size={16} className="text-blue-600" />
            </div>
            <p className="text-[12px] font-medium text-muted-fg uppercase tracking-wide">Aktiv</p>
          </div>
          <p className="text-2xl font-heading font-bold">{upcoming.length}</p>
        </div>
        <div className="p-5 rounded-2xl border border-border-subtle bg-surface">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
              <CheckCircle2 size={16} className="text-green-600" />
            </div>
            <p className="text-[12px] font-medium text-muted-fg uppercase tracking-wide">Vergangen</p>
          </div>
          <p className="text-2xl font-heading font-bold">{history.length}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-surface border border-border-subtle animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-20 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
          <Ticket size={40} strokeWidth={1.2} className="mx-auto mb-4 opacity-40" />
          <p className="text-base font-medium">Noch keine Tickets</p>
          <p className="text-[13px] mt-1.5">Tickets erscheinen hier sobald du welche kaufst.</p>
        </div>
      ) : (
        <>
          {/* Upcoming Section */}
          {upcoming.length > 0 && (
            <div>
              <button
                onClick={() => setShowUpcoming(!showUpcoming)}
                className="flex items-center justify-between w-full mb-3"
              >
                <h2 className="text-base font-heading font-semibold">Bevorstehend ({upcoming.length})</h2>
                {showUpcoming ? <ChevronUp size={18} className="text-muted-fg" /> : <ChevronDown size={18} className="text-muted-fg" />}
              </button>
              {showUpcoming && (
                <div className="space-y-2 stagger-children">
                  {upcoming.map((event) => (
                    <TicketCard key={event.id} event={event} status={statusConfig(event)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* History Section */}
          {history.length > 0 && (
            <div>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center justify-between w-full mb-3"
              >
                <h2 className="text-base font-heading font-semibold">Vergangen ({history.length})</h2>
                {showHistory ? <ChevronUp size={18} className="text-muted-fg" /> : <ChevronDown size={18} className="text-muted-fg" />}
              </button>
              {showHistory && (
                <div className="space-y-2 stagger-children">
                  {history.map((event) => (
                    <TicketCard key={event.id} event={event} status={statusConfig(event)} dimmed />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TicketCard({ event, status, dimmed }: { event: any; status: any; dimmed?: boolean }) {
  const StatusIcon = status.icon;
  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border border-border-subtle bg-surface ${dimmed ? 'opacity-60' : ''}`}>
      <div className="w-14 h-14 rounded-lg bg-muted overflow-hidden flex-shrink-0">
        {event.image_url ? (
          <img src={event.image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageOff size={18} strokeWidth={1.4} className="text-muted-fg/30" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-[14px] truncate">{event.title}</h3>
        <p className="text-[12px] text-muted-fg mt-0.5">
          {formatDate(event.date)} · {formatTime(event.time)}
        </p>
        <p className="text-[12px] text-muted-fg truncate">{event.location}</p>
      </div>
      <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border flex-shrink-0 ${status.color}`}>
        <StatusIcon size={12} />
        {status.label}
      </span>
    </div>
  );
}
