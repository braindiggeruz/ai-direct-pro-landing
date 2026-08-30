const TEMPLATE_DRAFT_KEY = 'lead-radar:template-draft:v1';
const TEMPLATE_DRAFT_TTL_MS = 86_400_000;

// Audit CP-3: the operator's composer draft must survive a page reload.
// Mirrors campaign-media-draft: only the operator's own draft text is kept in
// this tab with a 24-hour expiry — no contacts, no secrets, no server state.
export function saveCampaignTemplateDraft(template: string): void {
  try {
    if (template.trim().length > 0) {
      sessionStorage.setItem(TEMPLATE_DRAFT_KEY, JSON.stringify({ template, expiresAt: Date.now() + TEMPLATE_DRAFT_TTL_MS }));
    } else {
      sessionStorage.removeItem(TEMPLATE_DRAFT_KEY);
    }
  } catch { /* Storage-disabled browsers still support the in-memory draft. */ }
}

export function readCampaignTemplateDraft(): string | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(TEMPLATE_DRAFT_KEY) ?? 'null');
    if (value && typeof value.expiresAt === 'number' && value.expiresAt > Date.now()
      && typeof value.template === 'string' && value.template.trim().length > 0) return value.template;
  } catch { /* Untrusted or expired draft data is ignored. */ }
  return null;
}
