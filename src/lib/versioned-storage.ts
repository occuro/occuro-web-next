/**
 * Versioned localStorage helper.
 *
 * Problem: when we change the shape of a stored preference (e.g. add a
 * required field, rename a key) and a returning user has the OLD shape
 * in their browser, the parsed value can crash the component that
 * reads it. This helper sidesteps that by namespacing every key with
 * a schema version. When you bump SCHEMA_VERSION the old data is
 * silently ignored — defaults take over. No more "white screen after
 * deploy" because of stale localStorage.
 *
 * Usage:
 *   import { getStored, setStored } from '@/lib/versioned-storage';
 *   const prefs = getStored('notification_prefs', DEFAULTS);
 *   setStored('notification_prefs', next);
 */

// Bump this whenever we make a non-backwards-compatible change to ANY
// stored preference shape. Old keys become unreadable and are silently
// replaced with defaults.
export const SCHEMA_VERSION = 1;

const KEY_PREFIX = `@occuro/v${SCHEMA_VERSION}`;

function fullKey(key: string): string {
  return `${KEY_PREFIX}/${key}`;
}

export function getStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(fullKey(key));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    // Object-merge so newly-added fields fall back to defaults instead
    // of being undefined.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && fallback && typeof fallback === 'object') {
      return { ...(fallback as object), ...(parsed as object) } as T;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

export function setStored<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(fullKey(key), JSON.stringify(value));
  } catch {
    // Storage full or disabled — silently no-op
  }
}

export function removeStored(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(fullKey(key));
  } catch {
    // ignore
  }
}

/**
 * Removes all stored values from any older schema version. Call this
 * once at app boot to free up storage and ensure no stale data lingers
 * after a SCHEMA_VERSION bump.
 */
export function purgeOldSchemas(): void {
  if (typeof window === 'undefined') return;
  try {
    const currentPrefix = `${KEY_PREFIX}/`;
    const occuroPrefix = '@occuro/';
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k) continue;
      // Any @occuro key that's NOT for the current version should die
      if (k.startsWith(occuroPrefix) && !k.startsWith(currentPrefix)) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
