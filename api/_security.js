import crypto from 'node:crypto';

const COOKIE_NAME = 'cece_session';
const SESSION_SECONDS = 60 * 60 * 24 * 14;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function createSessionCookie() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not configured.');
  const payload = base64url(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }));
  const token = `${payload}.${sign(payload, secret)}`;
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function isAuthenticated(request) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const cookies = Object.fromEntries(String(request.headers.cookie || '').split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter((entry) => entry.length === 2));
  const token = cookies[COOKIE_NAME];
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload, secret))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number(parsed.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function verifyPassword(candidate) {
  const expected = process.env.APP_ACCESS_PASSWORD;
  if (!expected || typeof candidate !== 'string') return false;
  return safeEqual(candidate, expected);
}

export function clientIdentifier(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || request.socket?.remoteAddress || 'unknown';
}

export async function enforceRateLimit(request) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return { allowed: false, error: 'Rate-limit storage is not configured.' };

  const id = crypto.createHash('sha256').update(clientIdentifier(request)).digest('hex').slice(0, 24);
  const hourKey = `vision:hour:${id}:${new Date().toISOString().slice(0, 13)}`;
  const dayKey = `vision:day:${id}:${new Date().toISOString().slice(0, 10)}`;
  const hourlyLimit = Number(process.env.HOURLY_VISION_LIMIT || 20);
  const dailyLimit = Number(process.env.DAILY_VISION_LIMIT || 60);

  const command = async (key, ttl) => {
    const result = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, ttl, "NX"]]),
    });
    if (!result.ok) throw new Error('Rate-limit service unavailable.');
    const payload = await result.json();
    return Number(payload?.[0]?.result ?? 0);
  };

  const [hourCount, dayCount] = await Promise.all([command(hourKey, 3700), command(dayKey, 90000)]);
  if (hourCount > hourlyLimit || dayCount > dailyLimit) {
    return { allowed: false, status: 429, error: 'Vision limit reached. Try again later.', hourCount, dayCount };
  }
  return { allowed: true, hourCount, dayCount, hourlyLimit, dailyLimit };
}
