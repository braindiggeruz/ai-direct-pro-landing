/**
 * The tariffs page's island root (/uz/tariflar/, DECISIONS §13 п. 6; built
 * by stream F's prerender): `<div id="studio-root" data-tool="tariffs"
 * data-plans="…" data-terms="…">` holding billing/static.ts renderTariffs()
 * of the same plans and offer link. main.tsx reads the attributes back and
 * hydrates the same tree, so the page neither flashes nor asks the server
 * anything on load: /config is asked when a tariff's button is pressed.
 *
 * The attributes carry only what the page shows anyway (prices, quotas, the
 * offer's link). Anything malformed reads as no plans and no link.
 */
import type { StudioPlanId, StudioPlanOffer } from '../api';

/** `data-tool` of the tariffs page's root. */
export const TARIFFS_TOOL = 'tariffs';

const PLAN_IDS: readonly StudioPlanId[] = ['kunlik', 'oylik'];

const escapeAttribute = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** The root's attributes (a leading space, ready for `<div id="studio-root"${…}>`). */
export function encodeTariffsRoot(plans: readonly StudioPlanOffer[], termsUrl: string | null): string {
  return ` data-tool="${TARIFFS_TOOL}" data-plans="${escapeAttribute(JSON.stringify(plans))}" data-terms="${escapeAttribute(termsUrl ?? '')}"`;
}

const count = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1_000;

function plan(value: unknown): StudioPlanOffer | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !(PLAN_IDS as readonly string[]).includes(raw.id)) return null;
  if (typeof raw.itemId !== 'string' || !/^[a-z_]{1,40}$/.test(raw.itemId)) return null;
  if (typeof raw.amountTiyin !== 'number' || !Number.isSafeInteger(raw.amountTiyin) || raw.amountTiyin <= 0 || raw.amountUzs !== raw.amountTiyin / 100) return null;
  const duration = raw.duration as Record<string, unknown> | null;
  const hours = duration && typeof duration === 'object' && Object.keys(duration).length === 1 && count(duration.hours) ? { hours: duration.hours } : null;
  const months = duration && typeof duration === 'object' && Object.keys(duration).length === 1 && duration.calendarMonths === 1 ? { calendarMonths: 1 } : null;
  if (!hours && !months) return null;
  if (!count(raw.presentationFull) || !count(raw.photoTask) || !count(raw.regenPerUnit)) return null;
  return {
    id: raw.id as StudioPlanId,
    itemId: raw.itemId,
    amountTiyin: raw.amountTiyin,
    amountUzs: raw.amountUzs,
    duration: (hours ?? months)!,
    presentationFull: raw.presentationFull,
    photoTask: raw.photoTask,
    regenPerUnit: raw.regenPerUnit,
  };
}

/** An https link on gptbot.uz, else null. */
function siteLink(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 300) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'gptbot.uz' && !url.port && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** The plans and the offer link of the root's `dataset` (as the browser decodes the attributes). */
export function decodeTariffsRoot(dataset: { readonly plans?: string; readonly terms?: string }): { plans: StudioPlanOffer[]; termsUrl: string | null } {
  let plans: StudioPlanOffer[] = [];
  try {
    const parsed: unknown = JSON.parse(dataset.plans ?? '[]');
    if (Array.isArray(parsed) && parsed.length <= PLAN_IDS.length) {
      const read = parsed.map(plan);
      if (read.every((entry): entry is StudioPlanOffer => entry !== null)) plans = read;
    }
  } catch {
    plans = [];
  }
  return { plans, termsUrl: siteLink(dataset.terms) };
}
