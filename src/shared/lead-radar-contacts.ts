import { findPhoneNumbersInText, isSupportedCountry, parsePhoneNumberWithError, type CountryCode } from 'libphonenumber-js/max';

export type LeadRadarPhoneType = 'mobile' | 'fixed_line' | 'fixed_or_mobile' | 'voip' | 'service' | 'unknown' | 'invalid';
export interface LeadRadarPhoneAssessment {
  e164: string | null;
  type: LeadRadarPhoneType;
  /** This is a lookup candidate, never permission to message or proof of ownership. */
  mobileLookupCandidate: boolean;
  reason: 'mobile_unverified' | 'fixed_line' | 'ambiguous_line_type' | 'service_number' | 'extension' | 'invalid_number';
}

export interface LeadRadarContactCandidate {
  key: string;
  kind: 'phone' | 'telegram';
  value: string;
  phoneType: LeadRadarPhoneType | null;
  ownership: 'company' | 'unconfirmed' | 'personal';
  lookupEligible: boolean;
  reason: string;
  sourceUrl: string | null;
  evidenceIds: string[];
  observedAt: string | null;
  /** Resolution is independent from source ownership and outreach authorization. */
  resolution?: 'pending' | 'resolved' | 'unresolved' | 'unsupported' | 'limited';
  resolvedAt?: string | null;
}

export type LeadRadarTelegramLocator = { kind: 'username' | 'phone' | 'business_link'; value: string; url: string };

export function parseLeadRadarTelegramLocator(raw: string): LeadRadarTelegramLocator | null {
  if (raw.length > 400) return null;
  try {
    const input = raw.trim().replace(/&amp;/g, '&');
    const url = new URL(input.startsWith('@') ? `https://t.me/${input.slice(1)}` : input);
    if (url.username || url.password || url.port) return null;
    let path: string;
    if (url.protocol === 'tg:' && url.hostname === 'resolve') {
      path = url.searchParams.has('phone') ? `+${url.searchParams.get('phone')!.replace(/^\+/, '')}` : url.searchParams.get('domain') ?? '';
    } else if (url.protocol === 'tg:' && url.hostname === 'message') {
      path = `m/${url.searchParams.get('slug') ?? ''}`;
    } else if (['http:', 'https:'].includes(url.protocol) && ['t.me', 'telegram.me', 'www.t.me'].includes(url.hostname)) {
      path = url.pathname.replace(/^\//, '').replace(/\/$/, '');
    } else return null;
    if (/^\+\d{8,15}$/.test(path)) {
      const phone = assessLeadRadarPhone(path);
      return phone.e164 ? { kind: 'phone', value: phone.e164, url: `https://t.me/${phone.e164}` } : null;
    }
    if (/^m\/[A-Za-z0-9_-]{4,128}$/.test(path)) return { kind: 'business_link', value: path.slice(2), url: `https://t.me/${path}` };
    if (/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(path)
      && !['share', 'joinchat', 'login', 'proxy', 'socks', 'addstickers', 'addemoji', 'invoice', 'contact'].includes(path.toLowerCase())) {
      return { kind: 'username', value: path, url: `https://t.me/${path}` };
    }
    return null;
  } catch { return null; }
}

function countryCode(country: string): CountryCode | undefined {
  const candidate = country.toUpperCase();
  return isSupportedCountry(candidate) ? candidate as CountryCode : undefined;
}

export function assessLeadRadarPhone(value: string, country = 'UZ'): LeadRadarPhoneAssessment {
  const invalid: LeadRadarPhoneAssessment = { e164: null, type: 'invalid', mobileLookupCandidate: false, reason: 'invalid_number' };
  if (typeof value !== 'string' || value.length > 180) return invalid;
  let normalized = value.trim().replace(/^tel:/i, '').replace(/\u00a0/g, ' ');
  try { normalized = decodeURIComponent(normalized); } catch { return invalid; }
  normalized = normalized.replace(/^00(?=\d)/, '+');
  if (country.toUpperCase() === 'UZ' && /^998[\s()-]*\d/.test(normalized)) normalized = `+${normalized}`;
  // Never silently take the first of multiple phone numbers or arbitrary prose.
  if (/[\n,|/]/.test(normalized)) return invalid;
  try {
    const phone = parsePhoneNumberWithError(normalized, { defaultCountry: countryCode(country), extract: false });
    if (!phone.isPossible() || !phone.isValid()) return invalid;
    const rawType = phone.getType();
    const type: LeadRadarPhoneType = rawType === 'MOBILE' ? 'mobile'
      : rawType === 'FIXED_LINE' ? 'fixed_line'
        : rawType === 'FIXED_LINE_OR_MOBILE' ? 'fixed_or_mobile'
          : rawType === 'VOIP' ? 'voip' : rawType ? 'service' : 'unknown';
    const reason = phone.ext ? 'extension' : type === 'mobile' ? 'mobile_unverified'
      : type === 'fixed_line' ? 'fixed_line' : type === 'service' ? 'service_number' : 'ambiguous_line_type';
    return { e164: phone.number, type, mobileLookupCandidate: type === 'mobile' && !phone.ext, reason };
  } catch { return invalid; }
}

/** Bounded extraction. All numbers remain candidates until source ownership is checked. */
export function extractLeadRadarPhones(text: string, country = 'UZ', limit = 12): LeadRadarPhoneAssessment[] {
  const results = new Map<string, LeadRadarPhoneAssessment>();
  const source = text.slice(0, 900_000).replace(/\u00a0/g, ' ')
    .replace(/(^|[\s"'=>(;])998(?=[\s().-]*\d)/g, '$1+998');
  const append = (raw: string) => {
    const assessed = assessLeadRadarPhone(raw, country);
    if (assessed.e164 && !results.has(assessed.e164)) results.set(assessed.e164, assessed);
  };
  for (const match of findPhoneNumbersInText(source, countryCode(country))) {
    append(`${match.number.number}${match.number.ext ? ` ext. ${match.number.ext}` : ''}`);
    if (results.size >= limit) break;
  }
  return [...results.values()].slice(0, Math.max(0, Math.min(20, limit)));
}

export const LEAD_RADAR_CONTACT_REASON_COPY: Record<string, string> = {
  mobile_unverified: 'Мобильный номер: Telegram ещё не проверен',
  fixed_line: 'Стационарный: не используется для поиска Telegram по номеру',
  ambiguous_line_type: 'Тип линии неоднозначен: нужна проверка',
  service_number: 'Служебный номер: исключён из получателей',
  extension: 'Номер с добавочным: исключён из поиска Telegram',
  invalid_number: 'Некорректный номер: исключён',
  ownership_unconfirmed: 'Принадлежность компании не подтверждена официальным источником',
  telegram_unverified: 'Корпоративный источник подтверждён; аккаунт ещё не проверен',
  unsupported_telegram: 'Бот, канал, группа или личный контакт: автоматическая отправка закрыта',
};
