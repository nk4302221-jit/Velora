/**
 * Minimal fixed-window, in-memory rate limiter.
 *
 * Deliberately dependency-free: the project does not ship express-rate-limit,
 * and the goal here is only to blunt credential-stuffing / brute-force bursts
 * against the authentication endpoints, not to be a distributed limiter. State
 * lives in this process, so a multi-instance deployment would need a shared
 * store instead.
 *
 * Each limiter keeps a bucket per client IP + prefix. Buckets older than their
 * window are reclaimed lazily, and a size cap prevents unbounded growth under
 * a flood of distinct source IPs.
 */

const MAX_TRACKED_KEYS = 10000;

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = forwarded
    ? String(forwarded).split(',')[0]
    : req.ip || req.socket?.remoteAddress || 'unknown';
  return String(raw).trim() || 'unknown';
}

/**
 * @param {Object} options
 * @param {number} [options.windowMs]  Window length in milliseconds.
 * @param {number} [options.max]       Allowed requests per window per IP.
 * @param {string} [options.prefix]    Namespace so limiters do not share buckets.
 * @param {string} [options.message]   Body message returned on 429.
 */
export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 20,
  prefix = 'rl',
  message = 'Too many attempts. Please try again later.',
} = {}) {
  const buckets = new Map();

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const key = `${prefix}:${clientIp(req)}`;

    let bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      // Opportunistic sweep: if the map has grown too large, drop expired
      // buckets before inserting a new one so memory stays bounded.
      if (buckets.size >= MAX_TRACKED_KEYS) {
        for (const [k, b] of buckets) {
          if (now >= b.resetAt) buckets.delete(k);
        }
      }

      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        message,
      });
    }

    return next();
  };
}

export default { createRateLimiter };
