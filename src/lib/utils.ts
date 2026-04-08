import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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

export function getCategoryColor(category: string): string {
  const map: Record<string, string> = {
    music: '#8b5cf6',
    business: '#3b82f6',
    health: '#22c55e',
    sports: '#f97316',
    education: '#ec4899',
    art: '#ef4444',
    food: '#f59e0b',
    technology: '#06b6d4',
    community: '#14b8a6',
    outdoor: '#84cc16',
  };
  return map[category?.toLowerCase()] ?? '#8C8C88';
}
