import type { LeadRadarLifecycle, LeadRadarSearchInput } from '../../../src/shared/lead-radar';
import { LEAD_RADAR_LIFECYCLE } from '../../../src/shared/lead-radar';

export class LeadRadarValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'LeadRadarValidationError';
  }
}
function text(value: unknown, max: number, code: string): string {
  if (typeof value !== 'string') throw new LeadRadarValidationError(code);
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length < 2 || normalized.length > max) {
    throw new LeadRadarValidationError(code);
  }
  return normalized;
}

export function parseSearchInput(value: unknown): LeadRadarSearchInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LeadRadarValidationError('invalid_search');
  }
  const raw = value as Record<string, unknown>;
  const desiredCount = Number(raw.desiredCount);
  if (!Number.isInteger(desiredCount) || desiredCount < 5 || desiredCount > 50) {
    throw new LeadRadarValidationError('invalid_desired_count');
  }
  const languages = Array.isArray(raw.languages)
    ? [...new Set(raw.languages.filter((item): item is 'ru' | 'uz' | 'en' => (
      item === 'ru' || item === 'uz' || item === 'en'
    )))]
    : [];
  if (languages.length === 0) throw new LeadRadarValidationError('invalid_languages');

  return {
    niche: text(raw.niche, 90, 'invalid_niche'),
    city: text(raw.city, 90, 'invalid_city'),
    country: text(raw.country ?? 'UZ', 40, 'invalid_country').toUpperCase(),
    offer: text(raw.offer, 180, 'invalid_offer'),
    desiredCount,
    telegramRequired: raw.telegramRequired === true,
    languages,
  };
}

export function parseLifecycle(value: unknown): LeadRadarLifecycle {
  if (typeof value !== 'string' || !LEAD_RADAR_LIFECYCLE.includes(value as LeadRadarLifecycle)) {
    throw new LeadRadarValidationError('invalid_lifecycle');
  }
  return value as LeadRadarLifecycle;
}

export function normalizeCompanyKey(value: string): string {
  return value
    .toLocaleLowerCase('ru-RU')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zа-яё0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

export function safePublicHttpUrl(value: string | null | undefined): URL | null {
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value.startsWith('www.') ? `https://${value}` : value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    if (url.port && !(
      (url.protocol === 'https:' && url.port === '443')
      || (url.protocol === 'http:' && url.port === '80')
    )) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (
      !host
      || host.length > 253
      || !host.includes('.')
      || host === 'localhost'
      || host.endsWith('.localhost')
      || host.endsWith('.local')
      || host.endsWith('.internal')
      || host === '0.0.0.0'
      || host === '::1'
      || /^127\./.test(host)
      || /^10\./.test(host)
      || /^169\.254\./.test(host)
      || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
      || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
      || /^\[?[a-f0-9:]+\]?$/.test(host)
      || host.endsWith('.test')
      || host.endsWith('.invalid')
      || host.endsWith('.example')
      || host === 'localtest.me'
      || host.endsWith('.localtest.me')
      || host === 'nip.io'
      || host.endsWith('.nip.io')
      || host === 'sslip.io'
      || host.endsWith('.sslip.io')
    ) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

export async function ownerOrgId(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('');
  return `owner_${hex.slice(0, 24)}`;
}
