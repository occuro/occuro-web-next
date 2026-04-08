'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import {
  Search, Map, CalendarDays, Ticket, Users, MessageCircle,
  User, Settings, LayoutDashboard, CalendarPlus, BarChart3,
  UserCheck, Building2, LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const userNav: NavItem[] = [
  { label: 'Entdecken', href: '/app', icon: Search },
  { label: 'Karte', href: '/app/map', icon: Map },
  { label: 'Kalender', href: '/app/calendar', icon: CalendarDays },
  { label: 'Tickets', href: '/app/wallet', icon: Ticket },
  { label: 'Freunde', href: '/app/friends', icon: Users },
  { label: 'Nachrichten', href: '/app/chat', icon: MessageCircle },
  { label: 'Profil', href: '/app/profile', icon: User },
  { label: 'Einstellungen', href: '/app/settings', icon: Settings },
];

const organizerNav: NavItem[] = [
  { label: 'Dashboard', href: '/organizer', icon: LayoutDashboard },
  { label: 'Meine Events', href: '/organizer/events', icon: CalendarDays },
  { label: 'Event erstellen', href: '/organizer/events/create', icon: CalendarPlus },
  { label: 'Tickets', href: '/organizer/tickets', icon: Ticket },
  { label: 'Reichweite', href: '/organizer/reach', icon: BarChart3 },
  { label: 'Follower', href: '/organizer/followers', icon: UserCheck },
  { label: 'Nachrichten', href: '/organizer/chat', icon: MessageCircle },
  { label: 'Profil', href: '/organizer/profile', icon: Building2 },
  { label: 'Einstellungen', href: '/organizer/settings', icon: Settings },
];

export function Sidebar({ variant }: { variant: 'user' | 'organizer' }) {
  const pathname = usePathname();
  const { profile, organization, signOut } = useAuth();
  const items = variant === 'organizer' ? organizerNav : userNav;
  const displayName = variant === 'organizer'
    ? organization?.name ?? profile?.full_name ?? 'Veranstalter'
    : profile?.full_name ?? 'User';
  const avatarUrl = variant === 'organizer'
    ? organization?.avatar_url ?? profile?.avatar_url
    : profile?.avatar_url;

  return (
    <aside className="w-[260px] h-screen sticky top-0 flex flex-col bg-surface border-r border-border-subtle">
      {/* Logo */}
      <div className="px-6 py-6">
        <Link href="/" className="group flex items-center gap-2">
          <span className="text-xl font-heading font-bold tracking-tight group-hover:opacity-70 transition-opacity">
            occuro
          </span>
        </Link>
        <p className="text-[11px] font-medium text-muted-fg mt-1 uppercase tracking-widest">
          {variant === 'organizer' ? 'Veranstalter' : 'Entdecken'}
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href ||
            (item.href !== '/app' && item.href !== '/organizer' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200',
                isActive
                  ? 'bg-primary-bg text-primary-text shadow-sm'
                  : 'text-foreground/70 hover:text-foreground hover:bg-muted/60',
              )}
            >
              <Icon
                size={17}
                strokeWidth={isActive ? 2.2 : 1.8}
                className={cn(
                  'transition-transform duration-200 flex-shrink-0',
                  !isActive && 'group-hover:scale-110',
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User Info + Logout */}
      <div className="px-3 py-4 border-t border-border-subtle">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold overflow-hidden ring-2 ring-border-subtle">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              displayName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold truncate">{displayName}</p>
            <p className="text-[11px] text-muted-fg truncate">
              {variant === 'organizer' ? 'Organisation' : 'Besucher'}
            </p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-full mt-2 py-2 rounded-xl text-[13px] font-medium text-muted-fg hover:text-foreground hover:bg-muted/60 transition-all duration-200 flex items-center justify-center gap-2"
        >
          <LogOut size={14} strokeWidth={1.8} />
          Abmelden
        </button>
      </div>
    </aside>
  );
}
