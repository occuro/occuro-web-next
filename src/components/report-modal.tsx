'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  X, AlertTriangle, Loader2, Check, Flag,
} from 'lucide-react';

type ReportTarget = 'event' | 'profile';

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  targetType: ReportTarget;
  targetId: string;
  /** Display name shown in the modal header */
  targetName?: string;
}

const REASONS_BY_TYPE: Record<ReportTarget, { value: string; label: string; description: string }[]> = {
  event: [
    { value: 'event_violation', label: 'Verstoß gegen Richtlinien', description: 'Illegal, gefährlich oder gegen die occuro-Regeln' },
    { value: 'spam', label: 'Spam', description: 'Wiederholte oder irreführende Inhalte' },
    { value: 'misleading', label: 'Irreführend', description: 'Falsche oder veraltete Informationen' },
    { value: 'inappropriate', label: 'Unangemessener Inhalt', description: 'Beleidigend, hasserfüllt oder nicht für alle geeignet' },
    { value: 'copyright', label: 'Urheberrechtsverletzung', description: 'Geschützte Inhalte ohne Erlaubnis' },
    { value: 'other', label: 'Sonstiges', description: 'Etwas anderes — bitte beschreibe es unten' },
  ],
  profile: [
    { value: 'profile_violation', label: 'Verstoß gegen Richtlinien', description: 'Illegal oder gegen die occuro-Regeln' },
    { value: 'fake_profile', label: 'Fake-Profil', description: 'Identitätsdiebstahl oder erfundene Person' },
    { value: 'harassment', label: 'Belästigung', description: 'Belästigt mich oder andere Nutzer' },
    { value: 'inappropriate', label: 'Unangemessener Inhalt', description: 'Beleidigend oder hasserfüllt' },
    { value: 'spam', label: 'Spam', description: 'Sendet ungewollte Nachrichten' },
    { value: 'other', label: 'Sonstiges', description: 'Etwas anderes — bitte beschreibe es unten' },
  ],
};

/**
 * Reusable report modal for both events and profiles. Calls the
 * `report-content` Edge Function (which inserts a content_reports row
 * AND sends an email to support@occuroapp.com via Resend if the API
 * key is configured). The function rate-limits to 5 reports per hour
 * per user and enforces a 24h cooldown per (user, target) pair.
 */
export function ReportModal({
  open, onClose, targetType, targetId, targetName,
}: ReportModalProps) {
  const supabase = createClient();
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasons = REASONS_BY_TYPE[targetType];

  function reset() {
    setSelectedReason(null);
    setDetails('');
    setSubmitting(false);
    setSuccess(false);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedReason) {
      setError('Bitte wähle einen Grund.');
      return;
    }
    setError(null);
    setSubmitting(true);

    const { data, error: invokeError } = await supabase.functions.invoke('report-content', {
      body: {
        targetType,
        targetId,
        reason: selectedReason,
        details: details.trim() || null,
      },
    });

    setSubmitting(false);

    if (invokeError) {
      setError(invokeError.message);
      return;
    }
    if (data && typeof data === 'object' && 'ok' in data && (data as { ok: boolean }).ok === false) {
      const message = typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : 'Meldung konnte nicht gesendet werden.';
      setError(message);
      return;
    }

    setSuccess(true);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[90vh] bg-surface rounded-t-3xl sm:rounded-3xl border border-border-subtle flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center">
              <Flag size={16} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-[15px] font-heading font-bold">
                {targetType === 'event' ? 'Event melden' : 'Profil melden'}
              </h2>
              {targetName && (
                <p className="text-[11px] text-muted-fg truncate max-w-[200px]">{targetName}</p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-full hover:bg-elevated transition-colors"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </div>

        {success ? (
          /* ─── Success state ─── */
          <div className="px-5 py-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-green-500/15 flex items-center justify-center mx-auto">
              <Check size={26} className="text-green-400" strokeWidth={2.4} />
            </div>
            <div>
              <h3 className="text-[15px] font-heading font-semibold">Meldung gesendet</h3>
              <p className="text-[12px] text-muted-fg mt-1.5 leading-relaxed">
                Danke für deine Meldung. Unser Team prüft sie und ergreift bei Bedarf entsprechende Maßnahmen.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="px-5 py-2.5 rounded-full text-[13px] font-semibold bg-elevated hover:bg-muted transition-colors"
            >
              Schließen
            </button>
          </div>
        ) : (
          /* ─── Form state ─── */
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <p className="text-[12px] text-muted-fg">
                Wähle einen Grund für deine Meldung. Wir prüfen jede Meldung und ergreifen wenn nötig Maßnahmen.
              </p>

              <div className="space-y-1.5">
                {reasons.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setSelectedReason(r.value)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      selectedReason === r.value
                        ? 'border-violet-500/40 bg-violet-500/[0.08]'
                        : 'border-border-subtle bg-elevated/50 hover:bg-elevated'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center ${
                        selectedReason === r.value ? 'bg-violet-500' : 'border border-border-strong'
                      }`}>
                        {selectedReason === r.value && <Check size={10} className="text-white" strokeWidth={3} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold">{r.label}</p>
                        <p className="text-[11px] text-muted-fg mt-0.5">{r.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted-fg uppercase tracking-wider">
                  Zusätzliche Details (optional)
                </label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={3}
                  maxLength={3000}
                  placeholder="Beschreibe das Problem genauer…"
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm resize-none focus:outline-none focus:border-violet-500/40"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[12px] text-red-400">
                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-border-subtle flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-border-subtle hover:bg-elevated transition-colors"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={submitting || !selectedReason}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Flag size={14} />}
                Melden
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
