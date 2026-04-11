'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/utils';
import {
  Heart, CheckCircle2, TrendingUp, CalendarDays, Link2, UserCheck,
  Share2, BarChart3, Trophy, Megaphone, Send, Loader2, AlertCircle,
  Check, Clock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Event } from '@/types/occuro';

type SendState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'success'; sent: number; notified: number }
  | { status: 'error'; message: string };

export default function ReachPage() {
  const { user, organization } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (user) void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, organization?.id]);

  async function fetchData() {
    setLoading(true);
    const orgId = organization?.id;

    let evQuery = supabase.from('events').select('*').order('date', { ascending: false });
    if (orgId) evQuery = evQuery.eq('organizer_org_id', orgId);
    else evQuery = evQuery.eq('organizer_profile_id', user!.id);
    const { data: evts } = await evQuery;
    setEvents(((evts ?? []) as Event[]));

    let fQuery = supabase.from('organizer_follows').select('id', { count: 'exact', head: true });
    if (orgId) fQuery = fQuery.eq('organizer_org_id', orgId);
    else fQuery = fQuery.eq('organizer_profile_id', user!.id);
    const { count } = await fQuery;
    setFollowerCount(count ?? 0);

    setLoading(false);
  }

  const stats = useMemo(() => {
    const totalInterested = events.reduce((s, e) => s + (e.interested_count || 0), 0);
    const totalConfirmed = events.reduce((s, e) => s + (e.confirmed_count || 0), 0);
    const avgInterested = events.length ? Math.round(totalInterested / events.length) : 0;
    const withShop = events.filter((e) => e.ticket_shop_url).length;
    return { totalReach: totalInterested + totalConfirmed, totalInterested, totalConfirmed, avgInterested, withShop };
  }, [events]);

  // Top events sorted by engagement (for the "best performers" list)
  const topEvents = [...events]
    .sort((a, b) => ((b.interested_count ?? 0) + (b.confirmed_count ?? 0)) - ((a.interested_count ?? 0) + (a.confirmed_count ?? 0)))
    .slice(0, 5);

  // Public, upcoming events the organizer can promote (push to followers)
  const today = new Date().toISOString().split('T')[0];
  const promotableEvents = events.filter(
    (e) => e.visibility === 'public' && (e.end_date ?? e.date ?? '') >= today,
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">Reichweite</h1>
          <p className="text-sm text-muted-fg mt-1">Deine Performance auf einen Blick</p>
        </div>
        {/* Quick action: open the push-to-followers modal directly */}
        {followerCount > 0 && promotableEvents.length > 0 && (
          <button
            onClick={() => setPushModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors shadow-lg shadow-violet-600/20"
          >
            <Megaphone size={14} /> Push senden
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-surface border border-border-subtle animate-pulse" />)}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-20 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
          <BarChart3 size={40} strokeWidth={1.2} className="mx-auto mb-4 opacity-40" />
          <p className="text-base font-medium">Noch keine Daten</p>
          <p className="text-[13px] mt-1.5">Erstelle Events um deine Reichweite zu sehen.</p>
        </div>
      ) : (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 stagger-children">
            <KPICard label="Gesamte Reichweite" value={stats.totalReach} icon={TrendingUp} />
            <KPICard label="Interessierte" value={stats.totalInterested} icon={Heart} />
            <KPICard label="Avg. pro Event" value={stats.avgInterested} icon={CalendarDays} />
            <KPICard label="Follower" value={followerCount} icon={UserCheck} />
            <KPICard label="Events mit Shop" value={stats.withShop} icon={Link2} />
            <KPICard label="Events gesamt" value={events.length} icon={CalendarDays} />
          </div>

          {/* Engagement */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="p-4 sm:p-5 rounded-2xl border border-border-subtle bg-surface">
              <div className="flex items-center gap-2 mb-3">
                <Heart size={16} className="text-pink-500" />
                <p className="text-[11px] sm:text-[12px] font-medium text-muted-fg uppercase tracking-wide">Interessierte</p>
              </div>
              <p className="text-2xl sm:text-3xl font-heading font-bold">{stats.totalInterested}</p>
            </div>
            <div className="p-4 sm:p-5 rounded-2xl border border-border-subtle bg-surface">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={16} className="text-green-500" />
                <p className="text-[11px] sm:text-[12px] font-medium text-muted-fg uppercase tracking-wide">Bestätigte</p>
              </div>
              <p className="text-2xl sm:text-3xl font-heading font-bold">{stats.totalConfirmed}</p>
            </div>
          </div>

          {/* Top Events */}
          {topEvents.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Trophy size={16} className="text-amber-500" />
                <h2 className="text-base font-heading font-semibold">Top Events</h2>
              </div>
              <div className="rounded-2xl border border-border-subtle bg-surface overflow-hidden divide-y divide-border-subtle">
                {topEvents.map((event, i) => (
                  <div key={event.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-elevated/30 transition-colors">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                      i === 0 ? 'bg-amber-500/20 text-amber-400'
                      : i === 1 ? 'bg-muted text-foreground/70'
                      : 'bg-orange-500/15 text-orange-400'
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate">{event.title}</p>
                      <p className="text-[11px] text-muted-fg">{formatDate(event.date)}</p>
                    </div>
                    {event.ticket_shop_url && <Link2 size={13} className="text-violet-500 flex-shrink-0" />}
                    <span className="flex items-center gap-1 text-[12px] text-muted-fg flex-shrink-0">
                      <Heart size={11} /> {event.interested_count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Push notification card ─── */}
          <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.05] to-purple-500/[0.05] p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                <Megaphone size={20} className="text-violet-400" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-heading font-bold">Erinnere deine Follower</h2>
                <p className="text-[13px] text-muted-fg mt-1 leading-relaxed">
                  Sende eine Push-Benachrichtigung an deine{' '}
                  <strong className="text-foreground">{followerCount}</strong> {followerCount === 1 ? 'Follower' : 'Follower'} um auf
                  eines deiner anstehenden Events aufmerksam zu machen.
                </p>
                <div className="mt-4">
                  {followerCount === 0 ? (
                    <p className="text-[12px] text-muted-fg italic">
                      Du brauchst mindestens einen Follower um Push senden zu können.
                    </p>
                  ) : promotableEvents.length === 0 ? (
                    <p className="text-[12px] text-muted-fg italic">
                      Erstelle ein öffentliches Event um es deinen Followern anzukündigen.
                    </p>
                  ) : (
                    <button
                      onClick={() => setPushModalOpen(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors shadow-lg shadow-violet-600/20"
                    >
                      <Send size={14} /> Event ankündigen
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Profile share card */}
          <div className="rounded-2xl border border-border-subtle bg-surface p-5 sm:p-6">
            <h2 className="text-base font-heading font-semibold mb-2">Profil teilen</h2>
            <p className="text-[13px] text-muted-fg mb-4">
              Teile dein Profil, um mehr Follower zu gewinnen und deine Events einem größeren Publikum zugänglich zu machen.
            </p>
            <button
              onClick={async () => {
                const url = `${window.location.origin}/organizer/profile`;
                if (navigator.share) {
                  try { await navigator.share({ title: 'occuro', url }); } catch {}
                } else {
                  try {
                    await navigator.clipboard.writeText(url);
                  } catch {}
                }
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-semibold border border-border-subtle bg-elevated hover:bg-muted transition-colors"
            >
              <Share2 size={14} /> Profil teilen
            </button>
          </div>
        </>
      )}

      {/* Push modal */}
      {pushModalOpen && (
        <PushModal
          events={promotableEvents}
          followerCount={followerCount}
          onClose={() => setPushModalOpen(false)}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Push to followers modal
// ────────────────────────────────────────────────────────────────────

function PushModal({
  events, followerCount, onClose,
}: {
  events: Event[];
  followerCount: number;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(events[0]?.id ?? null);
  const [sendState, setSendState] = useState<SendState>({ status: 'idle' });

  async function send() {
    if (!selectedEventId) return;
    setSendState({ status: 'sending' });

    const { data, error } = await supabase.functions.invoke('notify-new-event', {
      body: { eventId: selectedEventId },
    });

    if (error) {
      setSendState({
        status: 'error',
        message: error.message ?? 'Push konnte nicht gesendet werden.',
      });
      return;
    }

    // The function returns { sent, notified } on success.
    const result = data as { sent?: number; notified?: number; error?: string };
    if (result?.error) {
      setSendState({ status: 'error', message: result.error });
      return;
    }
    setSendState({
      status: 'success',
      sent: result?.sent ?? 0,
      notified: result?.notified ?? 0,
    });
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const isSending = sendState.status === 'sending';
  const isSuccess = sendState.status === 'success';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[90vh] bg-surface rounded-t-3xl sm:rounded-3xl border border-border-subtle flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
              <Megaphone size={16} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-[15px] font-heading font-bold">Event ankündigen</h2>
              <p className="text-[11px] text-muted-fg">
                An {followerCount} {followerCount === 1 ? 'Follower' : 'Follower'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSending}
            className="p-1.5 rounded-full hover:bg-elevated transition-colors disabled:opacity-50"
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        {isSuccess ? (
          /* Success state */
          <div className="px-5 py-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-green-500/15 flex items-center justify-center mx-auto">
              <Check size={26} className="text-green-400" strokeWidth={2.4} />
            </div>
            <div>
              <h3 className="text-[15px] font-heading font-semibold">Push gesendet!</h3>
              <p className="text-[12px] text-muted-fg mt-1.5">
                {(sendState as { sent: number; notified: number }).sent} Push-Nachrichten an{' '}
                {(sendState as { sent: number; notified: number }).notified} Follower geschickt.
              </p>
              <p className="text-[11px] text-muted-fg mt-2 italic">
                Hinweis: Manche Follower erhalten die Nachricht nur wenn sie sich innerhalb ihres
                Benachrichtigungs-Radius befinden.
              </p>
            </div>
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-full text-[13px] font-semibold bg-elevated hover:bg-muted transition-colors"
            >
              Schließen
            </button>
          </div>
        ) : (
          /* Form state */
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <p className="text-[12px] text-muted-fg">
                Wähle das Event das du deinen Followern ankündigen möchtest. Sie bekommen eine
                Push-Benachrichtigung mit dem Titel und einem Link zum Event.
              </p>

              <div className="space-y-1.5">
                {events.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedEventId(event.id)}
                    disabled={isSending}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      selectedEventId === event.id
                        ? 'border-violet-500/40 bg-violet-500/[0.08]'
                        : 'border-border-subtle bg-elevated/50 hover:bg-elevated'
                    } ${isSending ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center ${
                        selectedEventId === event.id ? 'bg-violet-500' : 'border border-border-strong'
                      }`}>
                        {selectedEventId === event.id && <Check size={10} className="text-white" strokeWidth={3} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold truncate">{event.title}</p>
                        <p className="text-[11px] text-muted-fg mt-0.5 flex items-center gap-1.5">
                          <Clock size={10} /> {formatDate(event.date)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {selectedEvent && (
                <div className="rounded-xl bg-elevated/50 border border-border-subtle p-3">
                  <p className="text-[10px] font-semibold text-muted-fg uppercase tracking-wider mb-1">Vorschau</p>
                  <p className="text-[13px] font-semibold">Neues Event 🎉</p>
                  <p className="text-[12px] text-muted-fg mt-0.5">
                    &quot;{selectedEvent.title}&quot; wurde gerade veröffentlicht
                  </p>
                </div>
              )}

              {sendState.status === 'error' && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[12px] text-red-400">
                  <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                  <span>{sendState.message}</span>
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-border-subtle flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSending}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-border-subtle hover:bg-elevated transition-colors"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={send}
                disabled={isSending || !selectedEventId}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Push senden
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function KPICard({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <div className="p-4 sm:p-5 rounded-2xl border border-border-subtle bg-surface hover:border-border-strong hover:shadow-[var(--shadow-sm)] transition-all duration-200">
      <div className="flex items-center justify-between">
        <p className="text-[11px] sm:text-[12px] font-medium text-muted-fg uppercase tracking-wide">{label}</p>
        <Icon size={16} strokeWidth={1.6} className="text-muted-fg/50" />
      </div>
      <p className="text-xl sm:text-2xl font-heading font-bold mt-2 tracking-tight">{value}</p>
    </div>
  );
}
