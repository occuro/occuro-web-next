import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { colors } from './theme';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatTime(timeStr: string) {
  return timeStr?.slice(0, 5) ?? '';
}

// Single source of truth is `colors.category` in ./theme — this used to be a
// verbatim copy of that map, which is how the off-palette `music` entry
// survived the first pass here. Import it instead so the two cannot drift.
export function getCategoryColor(category: string): string {
  const map: Record<string, string> = colors.category;
  return map[category?.toLowerCase()] ?? '#8C8C88';
}
