export const MAX_PAYLOAD_BYTES = 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export class DocumentError extends Error {
  constructor(code) { super(code); this.name = 'DocumentError'; this.code = code; }
}
const invalid = () => { throw new DocumentError('invalid_payload'); };
function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  if (Object.keys(value).some(key => !keys.includes(key))) invalid();
}
function text(value, max, optional = false) {
  if (optional && value === undefined) return;
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) invalid();
  // Remove neither markup nor punctuation: the template escapes all text literally.
  // eslint-disable-next-line no-control-regex -- Reject non-text control characters at the trust boundary.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) invalid();
}
export function validatePayload(type, payload) {
  if (Buffer.byteLength(JSON.stringify(payload) ?? '') > MAX_PAYLOAD_BYTES) invalid();
  if (type === 'presentation_pdf') {
    record(payload, ['locale', 'title', 'slides']);
    text(payload.title, 200);
    if (!Array.isArray(payload.slides) || payload.slides.length < 1 || payload.slides.length > 30) invalid();
    for (const slide of payload.slides) {
      record(slide, ['title', 'bullets', 'notes']);
      text(slide.title, 200);
      if (!Array.isArray(slide.bullets) || slide.bullets.length > 12) invalid();
      slide.bullets.forEach(value => text(value, 1000));
      text(slide.notes, 3000, true);
    }
  } else if (type === 'proposal_pdf') {
    record(payload, ['locale', 'company', 'contact', 'objective', 'packageId', 'scope', 'budgetTerms']);
    text(payload.company, 200); text(payload.contact, 300, true);
    text(payload.objective, 5000); text(payload.budgetTerms, 2000, true);
    if (payload.packageId !== 'custom') invalid();
    if (payload.scope !== undefined) {
      if (!Array.isArray(payload.scope) || payload.scope.length > 30) invalid();
      payload.scope.forEach(value => text(value, 1000));
    }
  } else invalid();
  if (!['ru', 'uz'].includes(payload.locale)) invalid();
  return payload;
}

export function validateJob(job) {
  if (!job || typeof job !== 'object' || !/^[a-zA-Z0-9_-]{8,100}$/.test(job.id ?? '')) invalid();
  if (typeof job.leaseToken !== 'string' || job.leaseToken.length < 16 || job.leaseToken.length > 256) invalid();
  if (!Number.isFinite(job.leaseExpiresAt) || !Number.isInteger(job.attempt) || job.attempt < 1 || job.attempt > 3) invalid();
  validatePayload(job.type, job.payload);
  return job;
}
