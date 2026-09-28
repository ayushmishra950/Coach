/**
 * Tiny in-process caches. Right for a single API server; with several instances use Redis
 * (or keep TTLs short, as here, so a stale entry never lives long).
 */
export function ttlCache<V>(ttlMs: number, max = 5000) {
  const map = new Map<string, { at: number; v: V }>();
  return {
    get(key: string): V | undefined {
      const e = map.get(key);
      if (!e) return undefined;
      if (Date.now() - e.at > ttlMs) {
        map.delete(key);
        return undefined;
      }
      return e.v;
    },
    set(key: string, v: V) {
      if (map.size >= max) map.delete(map.keys().next().value as string);
      map.set(key, { at: Date.now(), v });
    },
    delete(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}

/**
 * Per-institute "data version". Any write that changes attendance, marks, fees or students
 * bumps it, so cached reports / insights for that institute are recomputed on the next view.
 */
const versions = new Map<string, number>();
export const dataVersion = (instituteId: unknown) => versions.get(String(instituteId)) ?? 0;
export function bumpData(instituteId: unknown) {
  const k = String(instituteId);
  versions.set(k, (versions.get(k) ?? 0) + 1);
}

/** Caches an expensive per-institute computation until its data changes (or ttl passes). */
export function instituteMemo<V>(ttlMs: number) {
  const c = ttlCache<{ ver: number; v: Promise<V> }>(ttlMs, 2000);
  return (instituteId: unknown, key: string, compute: () => Promise<V>): Promise<V> => {
    const k = `${String(instituteId)}|${key}`;
    const ver = dataVersion(instituteId);
    const hit = c.get(k);
    if (hit && hit.ver === ver) return hit.v;
    const v = compute();
    c.set(k, { ver, v });
    v.catch(() => c.delete(k));
    return v;
  };
}

/** Listeners run after any User / Institute write (hooks live in those models). */
const authListeners = new Set<() => void>();
export const onAuthDataChange = (fn: () => void) => authListeners.add(fn);
export function authDataChanged() {
  for (const fn of authListeners) fn();
}
