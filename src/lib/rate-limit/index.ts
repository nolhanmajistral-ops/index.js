/**
 * Rate limiting en mémoire (fenêtre glissante). Suffisant pour une instance unique.
 * Pour plusieurs instances : remplacer le store par Redis (même interface).
 */
interface Bucket {
  hits: number[];
}
const store = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const bucket = store.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    store.set(key, bucket);
    const oldest = bucket.hits[0] ?? now;
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((windowMs - (now - oldest)) / 1000) };
  }
  bucket.hits.push(now);
  store.set(key, bucket);
  if (store.size > 10_000) {
    for (const [k, b] of store) if (b.hits.every((t) => now - t >= windowMs)) store.delete(k);
  }
  return { ok: true, remaining: limit - bucket.hits.length, retryAfterSec: 0 };
}

export const LIMITS = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  import: { limit: 20, windowMs: 60 * 60_000 },
  ai: { limit: 30, windowMs: 60 * 60_000 },
  export: { limit: 30, windowMs: 60 * 60_000 },
  mutation: { limit: 300, windowMs: 60 * 60_000 },
} as const;

export function resetRateLimits() {
  store.clear();
}
