'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

interface SettingsShellProps {
  title: string;
  description?: string;
  backHref?: string;
  children: ReactNode;
}

/**
 * Shared layout for settings sub-pages. Renders a back button to the
 * settings index, the page title + optional description, and a max-width
 * content area. Use SettingsCard inside to group related controls.
 */
export function SettingsShell({ title, description, backHref = '/app/settings', children }: SettingsShellProps) {
  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-fg hover:text-foreground transition-colors mb-2"
        >
          <ArrowLeft size={13} /> Einstellungen
        </Link>
        <h1 className="text-2xl font-heading font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-fg mt-1">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * Card section that visually groups related settings. Use the optional
 * `title` prop for an above-card label that mirrors the index page style.
 */
export function SettingsCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div>
      {title && (
        <h2 className="text-[11px] font-semibold text-muted-fg uppercase tracking-wider mb-2 px-1">
          {title}
        </h2>
      )}
      <div className="rounded-2xl border border-border-subtle bg-surface overflow-hidden divide-y divide-border-subtle">
        {children}
      </div>
    </div>
  );
}

/**
 * Single settings row. Used inside SettingsCard. Renders an optional
 * leading icon, a label + subtitle, and a trailing slot (toggle, value,
 * chevron, etc.).
 */
interface SettingsRowProps {
  label: string;
  subtitle?: string;
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  trailing?: ReactNode;
  onClick?: () => void;
  href?: string;
}
export function SettingsRow({ label, subtitle, icon: Icon, trailing, onClick, href }: SettingsRowProps) {
  const className = 'w-full flex items-center gap-3.5 px-4 py-3.5 transition-colors text-left hover:bg-elevated/50 group';
  const inner = (
    <>
      {Icon && (
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-muted text-foreground/70 group-hover:bg-elevated group-hover:text-foreground transition-colors">
          <Icon size={16} strokeWidth={1.8} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium">{label}</p>
        {subtitle && (
          <p className="text-[12px] text-muted-fg truncate">{subtitle}</p>
        )}
      </div>
      {trailing}
    </>
  );
  if (href) {
    return <Link href={href} className={className}>{inner}</Link>;
  }
  if (onClick) {
    return <button onClick={onClick} className={className}>{inner}</button>;
  }
  return <div className={className.replace('hover:bg-elevated/50', '')}>{inner}</div>;
}

/**
 * iOS-style toggle. Controlled — pass `checked` and `onChange`.
 */
export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-primary-bg' : 'bg-muted'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-surface shadow-sm transform transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
