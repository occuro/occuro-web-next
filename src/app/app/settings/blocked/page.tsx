'use client';

import { useEffect, useState } from 'react';
import { SettingsShell, SettingsCard } from '@/components/settings-shell';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import { UserX, Loader2 } from 'lucide-react';

interface BlockedProfile {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  blocked_at: string | null;
}

export default function BlockedUsersPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [blocked, setBlocked] = useState<BlockedProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function load() {
    setLoading(true);
    const { data: blocks } = await supabase
      .from('user_blocks')
      .select('blocked_id, created_at')
      .eq('blocker_id', user!.id);
    const ids = (blocks ?? []).map((b: { blocked_id: string }) => b.blocked_id);
    if (ids.length === 0) {
      setBlocked([]);
      setLoading(false);
      return;
    }
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url')
      .in('id', ids);
    const blockMap = new Map((blocks ?? []).map((b: { blocked_id: string; created_at: string }) => [b.blocked_id, b.created_at]));
    setBlocked(
      (profiles ?? []).map((p: { id: string; full_name: string | null; username: string | null; avatar_url: string | null }) => ({
        ...p,
        blocked_at: (blockMap.get(p.id) as string | undefined) ?? null,
      })),
    );
    setLoading(false);
  }

  async function unblock(id: string) {
    await supabase.from('user_blocks').delete().match({ blocker_id: user!.id, blocked_id: id });
    setBlocked((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <SettingsShell title="Blockierte Nutzer" description="User in dieser Liste können dein Profil nicht sehen oder dich kontaktieren.">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-muted-fg" />
        </div>
      ) : blocked.length === 0 ? (
        <div className="text-center py-12 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
          <UserX size={32} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Keine blockierten Nutzer</p>
        </div>
      ) : (
        <SettingsCard>
          {blocked.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center">
                {b.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold text-foreground/70">
                    {(b.full_name ?? b.username ?? '?').charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium truncate">{b.full_name ?? 'User'}</p>
                {b.username && <p className="text-[12px] text-muted-fg truncate">@{b.username}</p>}
              </div>
              <button
                onClick={() => unblock(b.id)}
                className="px-3 py-1.5 rounded-xl text-[12px] font-medium border border-border-subtle hover:bg-elevated transition-colors"
              >
                Aufheben
              </button>
            </div>
          ))}
        </SettingsCard>
      )}
    </SettingsShell>
  );
}
