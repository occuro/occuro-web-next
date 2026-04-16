'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Event } from '@/types/occuro';
import { formatDate, formatTime, getCategoryColor } from '@/lib/utils';
import Link from 'next/link';
import {
  MapPin, BadgeCheck, Users, Pencil, Settings, Clock, Calendar,
  Plus, X, Save, Loader2, Tag,
  CalendarRange, TrendingUp,
} from 'lucide-react';
import { ImageUpload } from '@/components/image-upload';
import { EventBanner } from '@/components/event-banner';

type EventTab = 'upcoming' | 'live' | 'past';

export default function OrganizerProfilePage() {
  const { profile, organization } = useAuth();
  const supabase = createClient();

  const [tab, setTab] = useState<EventTab>('upcoming');
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const now = useMemo(() => new Date(), []);
  const today = now.toISOString().split('T')[0];

  useEffect(() => {
    if (organization?.id) void fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  async function fetchEvents() {
    if (!organization?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('organizer_org_id', organization.id)
      .neq('visibility', 'private') // organizers only have public events
      .order('date', { ascending: true });
    setEvents(data ?? []);
    setLoading(false);
  }

  // ── Derived lists ────────────────────────────────────────────────
  const upcomingEvents = useMemo(
    () => events.filter((e) => (e.end_date ?? e.date) >= today).sort((a, b) => a.date.localeCompare(b.date)),
    [events, today],
  );
  const pastEvents = useMemo(
    () => events.filter((e) => (e.end_date ?? e.date) < today).sort((a, b) => b.date.localeCompare(a.date)),
    [events, today],
  );
  const liveEvents = useMemo(() => {
    return events.filter((e) => {
      // "Live" = today is between start and end (inclusive)
      const start = e.date;
      const end = e.end_date ?? e.date;
      return start <= today && today <= end;
    });
  }, [events, today]);

  const totalEvents = events.length;
  const upcomingCount = upcomingEvents.length;
  const liveCount = liveEvents.length;
  const pastCount = pastEvents.length;

  const activeEvents =
    tab === 'live' ? liveEvents
    : tab === 'past' ? pastEvents
    : upcomingEvents;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* ─── Header card ───
          Banner und Avatar/Identity sind komplett getrennt — kein
          Overlap. Banner zuerst, dann eigene Zeile mit Logo + Name. */}
      <div className="rounded-2xl border border-border-subtle bg-surface overflow-hidden">
        {/* Banner — orgs don't have banner_url in DB, use category-tinted gradient */}
        <div className="h-32 sm:h-40 bg-gradient-to-br from-violet-500/15 to-purple-600/15 relative">
          <div className="absolute top-3 right-3 flex gap-2">
            <button
              onClick={() => setEditOpen(true)}
              className="p-2 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-colors"
              aria-label="Profil bearbeiten"
            >
              <Pencil size={15} />
            </button>
            <Link
              href="/organizer/settings"
              className="p-2 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-colors"
              aria-label="Einstellungen"
            >
              <Settings size={15} />
            </Link>
          </div>
        </div>

        {/* Avatar row — sits BELOW the banner, not overlapping it */}
        <div className="px-6 pt-5 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-elevated ring-2 ring-border-subtle flex items-center justify-center text-2xl font-bold overflow-hidden flex-shrink-0">
              {organization?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={organization.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-muted-fg">
                  {(organization?.name ?? profile?.full_name ?? 'O').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-xl sm:text-2xl font-heading font-bold truncate">
                  {organization?.name ?? profile?.full_name}
                </h1>
                {organization?.verified && (
                  <BadgeCheck size={18} className="text-violet-500 flex-shrink-0" strokeWidth={2.2} />
                )}
              </div>
              {organization?.category && (
                <span className="inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted text-foreground/70">
                  <Tag size={10} /> {organization.category}
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {organization?.bio && <p className="text-sm leading-relaxed">{organization.bio}</p>}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-fg">
              {organization?.location && (
                <span className="flex items-center gap-1.5"><MapPin size={13} strokeWidth={1.6} />{organization.location}</span>
              )}
              {organization?.verified && (
                <span className="flex items-center gap-1.5 text-green-500">
                  <BadgeCheck size={13} strokeWidth={1.6} /> Verifiziert
                </span>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              <Link href="/organizer/followers" className="flex flex-col items-center py-3 rounded-xl bg-elevated hover:bg-muted transition-colors group">
                <Users size={16} className="text-violet-500 mb-1" strokeWidth={2} />
                <p className="text-lg font-heading font-bold group-hover:text-violet-400 transition-colors">
                  {organization?.follower_count ?? 0}
                </p>
                <p className="text-[10px] text-muted-fg">Follower</p>
              </Link>
              <div className="flex flex-col items-center py-3 rounded-xl bg-elevated">
                <CalendarRange size={16} className="text-violet-500 mb-1" strokeWidth={2} />
                <p className="text-lg font-heading font-bold">{totalEvents}</p>
                <p className="text-[10px] text-muted-fg">Events gesamt</p>
              </div>
              <div className="flex flex-col items-center py-3 rounded-xl bg-elevated">
                <TrendingUp size={16} className="text-violet-500 mb-1" strokeWidth={2} />
                <p className="text-lg font-heading font-bold">{upcomingCount}</p>
                <p className="text-[10px] text-muted-fg">Anstehend</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Quick action: create new event ─── */}
      <Link
        href="/organizer/events/create"
        className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 transition-colors shadow-lg shadow-violet-600/20"
      >
        <Plus size={16} /> Neues Event erstellen
      </Link>

      {/* ─── Event tabs ─── */}
      <div className="flex rounded-2xl bg-muted p-1">
        {([
          { key: 'upcoming' as const, label: 'Anstehend', icon: Calendar, count: upcomingCount },
          { key: 'live' as const, label: 'Live', icon: TrendingUp, count: liveCount },
          { key: 'past' as const, label: 'Vergangen', icon: Clock, count: pastCount },
        ]).map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-medium transition-all duration-200 ${
                active ? 'bg-surface text-foreground shadow-sm' : 'text-muted-fg hover:text-foreground'
              }`}
            >
              <Icon size={14} strokeWidth={active ? 2.2 : 1.6} />
              {t.label}
              {t.count > 0 && <span className="text-[10px] opacity-60">({t.count})</span>}
            </button>
          );
        })}
      </div>

      {/* ─── Event list ─── */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-surface border border-border-subtle animate-pulse" />
          ))}
        </div>
      ) : activeEvents.length === 0 ? (
        <div className="text-center py-12 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
          {tab === 'upcoming' && <Calendar size={32} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />}
          {tab === 'live' && <TrendingUp size={32} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />}
          {tab === 'past' && <Clock size={32} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />}
          <p className="text-sm font-medium">
            {tab === 'upcoming' ? 'Du hast noch keine anstehenden Events.'
            : tab === 'live' ? 'Aktuell läuft kein Event.'
            : 'Noch keine vergangenen Events.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 stagger-children">
          {activeEvents.map((event) => (
            <Link
              key={event.id}
              href={`/app/event/${event.id}`}
              className="group flex items-center gap-4 p-4 rounded-xl border border-border-subtle bg-surface hover:bg-elevated/50 hover:border-border-strong transition-all duration-200"
            >
              <div className="w-14 h-14 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                <EventBanner event={event} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[14px] truncate">{event.title}</h3>
                <div className="flex items-center gap-3 text-[12px] text-muted-fg mt-0.5">
                  <span className="flex items-center gap-1"><Calendar size={11} />{formatDate(event.date)}</span>
                  <span className="flex items-center gap-1"><Clock size={11} />{formatTime(event.time)}</span>
                  <span className="flex items-center gap-1 min-w-0">
                    <MapPin size={11} className="flex-shrink-0" />
                    <span className="truncate">{event.location}</span>
                  </span>
                </div>
              </div>
              <span
                className="px-2.5 py-1 rounded-full text-[10px] font-semibold text-white flex-shrink-0"
                style={{ backgroundColor: getCategoryColor(event.category) }}
              >
                {event.category}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* ─── Edit modal ─── */}
      {editOpen && (
        <EditOrganizationModal
          organization={organization}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Edit organization modal
// ────────────────────────────────────────────────────────────────────

interface EditOrganizationModalProps {
  organization: ReturnType<typeof useAuth>['organization'];
  onClose: () => void;
  onSaved: () => void;
}

function EditOrganizationModal({ organization, onClose, onSaved }: EditOrganizationModalProps) {
  const supabase = createClient();
  const [name, setName] = useState(organization?.name ?? '');
  const [bio, setBio] = useState(organization?.bio ?? '');
  const [location, setLocation] = useState(organization?.location ?? '');
  const [category, setCategory] = useState(organization?.category ?? '');
  const [avatarUrl, setAvatarUrl] = useState(organization?.avatar_url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!organization?.id) return;
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('organizations')
      .update({
        name: name.trim(),
        bio: bio.trim() || null,
        location: location.trim() || null,
        category: category.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      })
      .eq('id', organization.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-in">
      <div className="w-full sm:max-w-lg bg-surface rounded-t-3xl sm:rounded-3xl border border-border-subtle max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <h2 className="text-lg font-heading font-bold">Organisation bearbeiten</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-elevated transition-colors"
            aria-label="Schließen"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <Field label="Name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name der Organisation"
              className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm focus:outline-none focus:border-violet-500/40"
            />
          </Field>
          <Field label="Bio">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Was macht ihr?"
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm resize-none focus:outline-none focus:border-violet-500/40"
            />
          </Field>
          <Field label="Standort">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="z.B. Wien, Österreich"
              className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm focus:outline-none focus:border-violet-500/40"
            />
          </Field>
          <Field label="Kategorie" hint="z.B. Club, Konzertveranstalter, Festival">
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="z.B. Club"
              className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm focus:outline-none focus:border-violet-500/40"
            />
          </Field>
          <Field label="Logo / Avatar">
            <ImageUpload
              value={avatarUrl}
              onChange={(url) => setAvatarUrl(url ?? '')}
              bucket="avatars"
              pathPrefix="org-avatars"
              variant="circle"
            />
          </Field>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[12px] text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border-subtle flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border-subtle text-sm font-medium hover:bg-elevated transition-colors"
            disabled={saving}
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-semibold text-foreground/80">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-fg">{hint}</p>}
    </div>
  );
}
