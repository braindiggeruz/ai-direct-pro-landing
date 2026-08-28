import { isValidCampaignMediaUpload, type LeadRadarTelegramCampaignMediaUpload } from './lead-radar-campaign';

const key = (scope: string) => `lead-radar:media-draft:v1:${scope}`;
// Only opaque metadata is retained in this tab; no image bytes, secrets or public URL.
export function saveCampaignMediaDraft(scope: string, media: LeadRadarTelegramCampaignMediaUpload | null): void {
  try {
    if (media) sessionStorage.setItem(key(scope), JSON.stringify({ media, expiresAt: Date.now() + 86_400_000 }));
    else sessionStorage.removeItem(key(scope));
  } catch { /* Storage-disabled browsers still support the current in-memory draft. */ }
}

export function readCampaignMediaDraft(scope: string): LeadRadarTelegramCampaignMediaUpload | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key(scope)) ?? 'null');
    if (value && typeof value.expiresAt === 'number' && value.expiresAt > Date.now()
      && isValidCampaignMediaUpload(value.media)) return value.media;
  } catch { /* Untrusted or expired local metadata cannot make an attachment ready. */ }
  return null;
}
