'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import {
  Search, Map, CalendarDays, Ticket, Users, MessageCircle,
  Settings, LayoutDashboard, CalendarPlus, BarChart3,
  UserCheck, LogOut, Home, ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Note: Profile is intentionally NOT in the nav. The footer profile card
// at the bottom of the sidebar links to it instead — feels more native and
// matches what most modern web apps (Linear, Notion, Figma) do.
const userNav: NavItem[] = [
  { label: 'Entdecken', href: '/app', icon: Search },
  { label: 'Karte', href: '/app/map', icon: Map },
  { label: 'Kalender', href: '/app/calendar', icon: CalendarDays },
  { label: 'Tickets', href: '/app/wallet', icon: Ticket },
  { label: 'Freunde', href: '/app/friends', icon: Users },
  { label: 'Nachrichten', href: '/app/chat', icon: MessageCircle },
  { label: 'Einstellungen', href: '/app/settings', icon: Settings },
];

const organizerNav: NavItem[] = [
  { label: 'Home', href: '/organizer', icon: Home },
  { label: 'Statistiken', href: '/organizer/dashboard', icon: LayoutDashboard },
  { label: 'Event erstellen', href: '/organizer/events/create', icon: CalendarPlus },
  { label: 'Tickets', href: '/organizer/tickets', icon: Ticket },
  { label: 'Reichweite', href: '/organizer/reach', icon: BarChart3 },
  { label: 'Follower', href: '/organizer/followers', icon: UserCheck },
  { label: 'Nachrichten', href: '/organizer/chat', icon: MessageCircle },
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
  const profileSubtitle = variant === 'organizer'
    ? organization?.verified ? 'Verifizierte Organisation' : 'Organisation'
    : profile?.username ? `@${profile.username}` : 'Mein Profil';
  const profileHref = variant === 'organizer' ? '/organizer/profile' : '/app/profile';
  const isProfileActive = pathname?.startsWith(profileHref) ?? false;

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
      <div className="px-3 py-4 border-t border-border-subtle space-y-1.5">
        {/* Clickable profile card — primary entry point to the profile page.
            Hover state hints at clickability with a chevron + bg shift. */}
        <Link
          href={variant === 'organizer' ? '/organizer/profile' : '/app/profile'}
          className={cn(
            'group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
            isProfileActive
              ? 'bg-muted/80'
              : 'hover:bg-muted/60',
          )}
        >
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold overflow-hidden ring-2 ring-border-subtle group-hover:ring-violet-500/40 transition-all">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-foreground/80">{displayName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            {/* Online dot */}
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-surface" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold truncate">{displayName}</p>
            <p className="text-[11px] text-muted-fg truncate">
              {profileSubtitle}
            </p>
          </div>
          <ChevronRight
            size={14}
            className="text-muted-fg/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all flex-shrink-0"
          />
        </Link>

        {/* Logout — quieter, secondary action */}
        <button
          onClick={signOut}
          className="w-full py-2 rounded-xl text-[12px] font-medium text-muted-fg hover:text-red-400 hover:bg-red-500/5 transition-all duration-200 flex items-center justify-center gap-2"
        >
          <LogOut size={13} strokeWidth={1.8} />
          Abmelden
        </button>
      </div>
    </aside>
  );
}
