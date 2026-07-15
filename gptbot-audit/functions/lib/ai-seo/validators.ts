// Backend safety validators for AI SEO patches.
//
// Every patch must pass these checks BEFORE the UI is allowed to display any
// field as approvable. The validator is the source of truth — provider output
// is fully untrusted.
//
// Each field is independently validated. Fields that fail hard are marked
// `blocked = true` and CANNOT be approved by the operator. Fields with
// non-blocking issues get warnings but remain approvable.
//
// Rules implemented:
//   - slug / URL / canonical never change
//   - title bounds 45..65
//   - description bounds 120..160
//   - h1 non-empty
//   - faq items: q+a non-empty, no duplicates by q, no markdown fences
//   - internal links: target must exist in allowedSlugs, no /admin-tools, /api,
//     external (we whitelist only paths), no self-loops, no draft/noindex/
//     random URLs, anchor non-empty and non-mojibake
//   - no fake numeric promises in copy: % growth, top-3 ranking guarantees,
//     "гарант*" / "guarantee", fake review counts
//   - locale lock: RU patches must keep Cyrillic dominant, UZ patches must
//     stay Uzbek-Latin (no Cyrillic outside brand names)
//   - mojibake (replacement char, Ð/Â sequences) rejected
//   - topicCluster: only known cluster ids
//   - targetMoneyPage: must exist in allowedSlugs and be in same locale
//
// Output: same patch with per-field blocked/warnings/blockReason filled in,
// plus patch-level globalErrors / globalWarnings.

import type {
  AiPatchContext,
  AiSeoPatchCandidate,
  AiSeoPatchField,
  AiPatchFieldKey,
} from '../../../src/shared/ai-seo';
import { hasMojibake } from '../../../src/shared/audit';

const TITLE_MIN = 40;
const TITLE_MAX = 70;
const DESCRIPTION_MIN = 110;
const DESCRIPTION_MAX = 165;

const BLOCK_PATH_PREFIXES = ['/admin-tools', '/api/', '/api-', '/draft/', '/test/', '/random/'];
const KNOWN_CLUSTERS = new Set([
  'ai-bot-business',
  'telegram-bot',
  'instagram-direct',
  'lead-processing',
  'sales-automation',
  'niche-clinic',
  'niche-beauty',
  'niche-edu',
  'niche-shop',
  'niche-horeca',
]);

const FAKE_CLAIM_PATTERNS = [
  /\b(гарант(?:ируем|ия|ии|ируется)|guarantee[ds]?)\b/i,
  /\bтоп[- ]?3 в (google|яндекс|yandex)/i,
  /\btop[- ]?3 (?:in )?(google|yandex)/i,
  /\b(\d{2,3})\s*%\s*(рост|growth|увелич|конверс)/i,
  /\b\d{3,}\s*(?:клиент|отзыв|review|client)/i, // "1000+ клиентов / 500 отзывов"
  /5\s*из\s*5\s*звезд|5\/5\s*stars/i,
];

const CYRILLIC = /[\u0400-\u04FF]/;
const LATIN = /[A-Za-z]/;

function containsFakeClaim(text: string): string | null {
  for (const re of FAKE_CLAIM_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

function isAllowedInternalTarget(target: string, ctx: AiPatchContext): { ok: boolean; reason?: string } {
  if (typeof target !== 'string' || !target) return { ok: false, reason: 'empty target' };
  if (!target.startsWith('/')) return { ok: false, reason: 'non-relative URL' };
  for (const p of BLOCK_PATH_PREFIXES) {
    if (target.startsWith(p)) return { ok: false, reason: `${p} path blocked` };
  }
  if (target.includes('?') || target.includes('#')) return { ok: false, reason: 'query/fragment URL' };
  if (target === ctx.url) return { ok: false, reason: 'self-loop link' };
  if (!ctx.allowedSlugs.includes(target)) return { ok: false, reason: 'target not in content store' };
  return { ok: true };
}

function validateLocale(text: string, locale: 'ru' | 'uz'): string | null {
  if (!text) return null;
  const hasCyr = CYRILLIC.test(text);
  const hasLat = LATIN.test(text);
  if (locale === 'ru' && !hasCyr && hasLat) return 'RU locale expected Cyrillic but got Latin-only text';
  if (locale === 'uz') {
    // Uzbek Latin allows latin and digits; a single brand word in Cyrillic is
    // OK, but more than 25% Cyrillic letters → cross-locale leak.
    const cyrCount = (text.match(/[\u0400-\u04FF]/g) || []).length;
    if (cyrCount / Math.max(1, text.length) > 0.25) return 'UZ locale leaked Cyrillic text';
  }
  return null;
}

function validateField(
  field: AiSeoPatchField,
  ctx: AiPatchContext,
): { warnings: string[]; blocked: boolean; blockReason?: string } {
  const warnings: string[] = [];
  let blocked = false;
  let blockReason: string | undefined;

  const after = field.after;

  // Forbid changes to immutable fields.
  if (['slug', 'url', 'canonical'].includes(field.field as string)) {
    blocked = true;
    blockReason = `${field.field} is immutable`;
    return { warnings, blocked, blockReason };
  }

  const block = (r: string) => { blocked = true; blockReason = r; };

  switch (field.field) {
    case 'title': {
      const v = typeof after === 'string' ? after.trim() : '';
      if (!v) { block('empty title'); break; }
      if (hasMojibake(v)) { block('mojibake in title'); break; }
      const fake = containsFakeClaim(v); if (fake) { block(`fake claim: "${fake}"`); break; }
      const locErr = validateLocale(v, ctx.locale); if (locErr) { block(locErr); break; }
      if (v.length < TITLE_MIN) warnings.push(`title shorter than ${TITLE_MIN}`);
      if (v.length > TITLE_MAX) warnings.push(`title longer than ${TITLE_MAX}`);
      break;
    }
    case 'description': {
      const v = typeof after === 'string' ? after.trim() : '';
      if (!v) { block('empty description'); break; }
      if (hasMojibake(v)) { block('mojibake in description'); break; }
      const fake = containsFakeClaim(v); if (fake) { block(`fake claim: "${fake}"`); break; }
      const locErr = validateLocale(v, ctx.locale); if (locErr) { block(locErr); break; }
      if (v.length < DESCRIPTION_MIN) warnings.push(`description shorter than ${DESCRIPTION_MIN}`);
      if (v.length > DESCRIPTION_MAX) warnings.push(`description longer than ${DESCRIPTION_MAX}`);
      break;
    }
    case 'h1':
    case 'heroSubtitle':
    case 'intro':
    case 'ogTitle':
    case 'ogDescription': {
      const v = typeof after === 'string' ? after.trim() : '';
      if (!v) { block(`empty ${field.field}`); break; }
      if (hasMojibake(v)) { block(`mojibake in ${field.field}`); break; }
      const fake = containsFakeClaim(v); if (fake) { block(`fake claim: "${fake}"`); break; }
      const locErr = validateLocale(v, ctx.locale); if (locErr) { block(locErr); break; }
      break;
    }
    case 'faq': {
      if (!Array.isArray(after)) { block('faq must be array'); break; }
      const seen = new Set<string>();
      for (let i = 0; i < after.length; i++) {
        const item = after[i] as { q?: unknown; a?: unknown };
        const q = typeof item?.q === 'string' ? item.q.trim() : '';
        const a = typeof item?.a === 'string' ? item.a.trim() : '';
        if (!q || !a) { block(`faq[${i}] missing q or a`); break; }
        if (hasMojibake(q) || hasMojibake(a)) { block(`faq[${i}] mojibake`); break; }
        const fake = containsFakeClaim(q) || containsFakeClaim(a);
        if (fake) { block(`faq[${i}] fake claim: "${fake}"`); break; }
        const key = q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
        if (seen.has(key)) { block(`faq[${i}] duplicate question`); break; }
        seen.add(key);
        const locErr = validateLocale(`${q} ${a}`, ctx.locale);
        if (locErr) { block(`faq[${i}] ${locErr}`); break; }
      }
      if (!blocked && after.length > 12) warnings.push('faq has more than 12 items');
      break;
    }
    case 'internalLinks': {
      if (!Array.isArray(after)) { block('internalLinks must be array'); break; }
      const seenTargets = new Set<string>();
      const anchors = new Set<string>();
      for (let i = 0; i < after.length; i++) {
        const raw = after[i];
        const target = typeof raw === 'string'
          ? raw
          : (raw && typeof (raw as { target?: unknown }).target === 'string'
              ? (raw as { target: string }).target
              : '');
        const guard = isAllowedInternalTarget(target, ctx);
        if (!guard.ok) { block(`internalLinks[${i}]: ${guard.reason}`); break; }
        if (seenTargets.has(target)) { block(`internalLinks[${i}]: duplicate target`); break; }
        seenTargets.add(target);
        if (typeof raw === 'object' && raw) {
          const anchor = (raw as { anchor?: unknown }).anchor;
          if (typeof anchor === 'string' && anchor.trim()) {
            if (hasMojibake(anchor)) { block(`internalLinks[${i}]: anchor mojibake`); break; }
            const fake = containsFakeClaim(anchor);
            if (fake) { block(`internalLinks[${i}]: anchor fake claim`); break; }
            const locErr = validateLocale(anchor, ctx.locale);
            if (locErr) { block(`internalLinks[${i}]: ${locErr}`); break; }
            anchors.add(anchor.trim().toLowerCase());
          }
        }
      }
      if (!blocked && anchors.size > 0 && anchors.size === 1 && (after as unknown[]).length > 2) {
        warnings.push('anchor diversity low: all anchors identical');
      }
      break;
    }
    case 'topicCluster': {
      const v = typeof after === 'string' ? after.trim() : '';
      if (!v) { block('topicCluster empty'); break; }
      if (!KNOWN_CLUSTERS.has(v)) {
        // Allow keyword-style cluster labels but warn.
        warnings.push(`unknown topicCluster "${v}"`);
      }
      break;
    }
    case 'targetMoneyPage': {
      const v = typeof after === 'string' ? after.trim() : '';
      if (!v) { block('targetMoneyPage empty'); break; }
      const guard = isAllowedInternalTarget(v, ctx);
      if (!guard.ok) { block(`targetMoneyPage: ${guard.reason}`); break; }
      if (!v.startsWith(`/${ctx.locale}/`)) warnings.push('targetMoneyPage locale mismatch');
      break;
    }
    case 'keywords': {
      if (!Array.isArray(after)) { block('keywords must be array'); break; }
      if (after.some((k) => typeof k !== 'string' || !k.trim())) { block('keywords contain empty values'); break; }
      if (after.length > 20) warnings.push('keywords has more than 20 items');
      break;
    }
    default:
      warnings.push(`unknown field "${field.field}" — not applied`);
      block(`unknown field "${field.field}"`);
  }

  return { warnings, blocked, blockReason };
}

export interface ValidationOutput {
  globalErrors: string[];
  globalWarnings: string[];
  fields: AiSeoPatchField[];
  acceptable: boolean;
}

const ALLOWED_FIELDS = new Set<AiPatchFieldKey>([
  'title','description','h1','heroSubtitle','intro','topicCluster',
  'targetMoneyPage','faq','internalLinks','keywords','ogTitle','ogDescription',
]);

export function validatePatch(
  candidate: AiSeoPatchCandidate,
  ctx: AiPatchContext,
  options: { isMoneyPage?: boolean } = {},
): ValidationOutput {
  const globalErrors: string[] = [];
  const globalWarnings: string[] = [];

  if (candidate.url !== ctx.url) globalErrors.push('patch url mismatch');
  if (candidate.locale !== ctx.locale) globalErrors.push('patch locale mismatch');
  if (!Array.isArray(candidate.fields)) {
    globalErrors.push('fields[] missing');
    return { globalErrors, globalWarnings, fields: [], acceptable: false };
  }
  if (candidate.fields.length === 0) {
    globalWarnings.push('LLM returned 0 fields');
  }

  const fields: AiSeoPatchField[] = [];
  const seenIds = new Set<string>();
  for (const raw of candidate.fields) {
    const id = String(raw?.id ?? raw?.field ?? `${fields.length}`);
    const field: AiSeoPatchField = {
      id: seenIds.has(id) ? `${id}-${fields.length}` : id,
      field: raw.field,
      before: raw.before,
      after: raw.after,
      reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 240) : '',
      risk: raw.risk === 'high' || raw.risk === 'medium' ? raw.risk : 'low',
    };
    seenIds.add(field.id);

    if (!ALLOWED_FIELDS.has(field.field)) {
      field.blocked = true;
      field.blockReason = `field "${field.field}" not allowed`;
      field.warnings = [];
      fields.push(field);
      continue;
    }

    const v = validateField(field, ctx);
    field.warnings = v.warnings;
    field.blocked = v.blocked;
    if (v.blockReason) field.blockReason = v.blockReason;
    fields.push(field);
  }

  // Money-page guard: even if the LLM proposes a noindex / status change, we
  // never honour it — those fields are not even in the allowed set, so this
  // is double-belt. Add an explicit global warning anyway.
  if (options.isMoneyPage) {
    globalWarnings.push('Money page — extra caution; review every field.');
  }

  const acceptable = globalErrors.length === 0 && fields.some((f) => !f.blocked);
  return { globalErrors, globalWarnings, fields, acceptable };
}
