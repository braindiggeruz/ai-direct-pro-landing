import { DocumentError } from './schema.mjs';

function integer(value, fallback, min, max) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new DocumentError('invalid_config');
  return n;
}
export function readConfig(env = process.env) {
  let url;
  try { url = new URL(env.DOCUMENT_API_BASE_URL); } catch { throw new DocumentError('invalid_config'); }
  const allowed = (env.DOCUMENT_API_ALLOWED_HOSTS || 'gptbot.uz,www.gptbot.uz').split(',').map(v => v.trim().toLowerCase());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      url.pathname !== '/' || url.port || !allowed.includes(url.hostname) ||
      allowed.some(host => !/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(host))) throw new DocumentError('invalid_config');
  const secret = env.DOCUMENT_WORKER_SECRET;
  if (typeof secret !== 'string' || secret.length < 32 || secret.length > 256 || /\s/.test(secret)) throw new DocumentError('invalid_config');
  return Object.freeze({
    apiBase: url.origin, secret,
    port: integer(env.PORT, 3000, 1, 65535),
    pollMs: integer(env.DOCUMENT_POLL_SECONDS, 20, 20, 300) * 1000,
    jobTimeoutMs: integer(env.DOCUMENT_JOB_TIMEOUT_SECONDS, 90, 10, 90) * 1000,
    shutdownMs: integer(env.DOCUMENT_SHUTDOWN_SECONDS, 25, 1, 90) * 1000,
    maintenanceMs: 60000,
    executablePath: env.DOCUMENT_CHROMIUM_EXECUTABLE || undefined,
  });
}
