'use client';

import { useAuth } from '@/lib/auth-context';
import { MapPin, BadgeCheck, Users } from 'lucide-react';

export default function OrganizerProfilePage() {
  const { profile, organization } = useAuth();

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-3xl font-heading font-bold tracking-tight">Organisationsprofil</h1>

      <div className="rounded-2xl border border-border-subtle bg-surface overflow-hidden">
        <div className="h-36 bg-gradient-to-br from-muted to-elevated">
          {profile?.banner_url && (
            <img src={profile.banner_url} alt="" className="w-full h-full object-cover" />
          )}
        </div>

        <div className="px-6 pb-6">
          <div className="w-20 h-20 rounded-full bg-elevated border-4 border-surface -mt-10 flex items-center justify-center text-2xl font-bold overflow-hidden">
            {organization?.avatar_url ? (
              <img src={organization.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-muted-fg">
                {(organization?.name ?? profile?.full_name ?? 'O').charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <h2 className="text-xl font-heading font-bold">
                {organization?.name ?? profile?.full_name}
              </h2>
              {organization?.category && (
                <span className="inline-block mt-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-muted text-foreground/70">
                  {organization.category}
                </span>
              )}
            </div>

            {organization?.bio && <p className="text-sm leading-relaxed">{organization.bio}</p>}

            <div className="flex gap-4 text-[13px] text-muted-fg">
              {organization?.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={13} strokeWidth={1.6} /> {organization.location}
                </span>
              )}
              {organization?.verified && (
                <span className="flex items-center gap-1.5 text-green-600">
                  <BadgeCheck size={13} strokeWidth={1.6} /> Verifiziert
                </span>
              )}
              {organization?.follower_count !== undefined && (
                <span className="flex items-center gap-1.5">
                  <Users size={13} strokeWidth={1.6} /> {organization.follower_count} Follower
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
