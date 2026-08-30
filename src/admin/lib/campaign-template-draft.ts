import type { LeadRadarCampaignContactBasis } from './lead-radar-campaign';

const TEMPLATE_DRAFT_KEY = 'lead-radar:template-draft:v1';
const TEMPLATE_DRAFT_TTL_MS = 86_400_000;

// Audit CP-3: the operator's composer draft must survive a page reload.
// Mirrors campaign-media-draft: only the operator's own draft text is kept in
// this tab with a 24-hour expiry — no contacts, no secrets, no server state.
function draftKey(scope?: string): string {
  return scope ? `${TEMPLATE_DRAFT_KEY}:${encodeURIComponent(scope)}` : TEMPLATE_DRAFT_KEY;
}

export function saveCampaignTemplateDraft(template: string, scope?: string): void {
  try {
    sessionStorage.setItem(draftKey(scope), JSON.stringify({ template, expiresAt: Date.now() + TEMPLATE_DRAFT_TTL_MS }));
  } catch { /* Storage-disabled browsers still support the in-memory draft. */ }
}

export function readCampaignTemplateDraft(scope?: string): string | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(draftKey(scope)) ?? 'null');
    if (value && typeof value.expiresAt === 'number' && value.expiresAt > Date.now()
      && typeof value.template === 'string' && value.template.length <= 4096) return value.template;
  } catch { /* Untrusted or expired draft data is ignored. */ }
  return null;
}

// This remembers only the operator's chosen type, never evidence or approval.
const BASIS_TYPES = ['documented_consent', 'inbound_request', 'existing_relationship', 'contractual_relationship'];
export function saveCampaignBasisDraft(scope: string, basis: string): void {
  try {
    if (BASIS_TYPES.includes(basis)) sessionStorage.setItem(`${draftKey(scope)}:basis`, JSON.stringify({ basis, expiresAt: Date.now() + TEMPLATE_DRAFT_TTL_MS }));
    else sessionStorage.removeItem(`${draftKey(scope)}:basis`);
  } catch { /* Optional draft metadata; server approval is always required. */ }
}
export function readCampaignBasisDraft(scope: string): LeadRadarCampaignContactBasis | '' {
  try {
    const value = JSON.parse(sessionStorage.getItem(`${draftKey(scope)}:basis`) ?? 'null');
    if (value?.expiresAt > Date.now() && BASIS_TYPES.includes(value.basis)) return value.basis;
  } catch { /* Untrusted or expired local metadata is ignored. */ }
  return '';
}
