import { DocumentError, type DocumentCreate, type PresentationPayload, type ProposalPayload } from './types';

function invalid(): never { throw new DocumentError('invalid_payload', 400); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !keys.includes(key))) return invalid();
  return row;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || Array.from(value).some(char => char.charCodeAt(0) < 32 && ![9, 10, 13].includes(char.charCodeAt(0)))) return invalid();
  return value.trim();
}
function strings(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) return invalid();
  return value.map(item => text(item, maxLength));
}
/** Only text is accepted. HTML, URLs, templates and asset locations have no execution/fetch semantics. */
export function validateDocumentCreate(value: unknown, owner: boolean): DocumentCreate {
  const input = object(value, ['type', 'payload']);
  const source = input.payload;
  if (input.type === 'presentation_pdf') {
    const row = object(source, ['locale', 'title', 'slides']);
    if ((row.locale !== 'ru' && row.locale !== 'uz') || !Array.isArray(row.slides) || row.slides.length < 1 || row.slides.length > 30) return invalid();
    const payload: PresentationPayload = {
      locale: row.locale as PresentationPayload['locale'], title: text(row.title, 200),
      slides: row.slides.map(value => {
        const slide = object(value, ['title', 'bullets', 'notes']);
        return { title: text(slide.title, 200), bullets: strings(slide.bullets, 12, 1000), ...(slide.notes === undefined ? {} : { notes: text(slide.notes, 3000) }) };
      }),
    };
    return { type: 'presentation_pdf', payload };
  }
  if (input.type === 'proposal_pdf' && owner) {
    const row = object(source, ['locale', 'company', 'contact', 'objective', 'packageId', 'scope', 'budgetTerms']);
    // Custom is a manual owner-authored proposal, not a quoted tariff or AI price.
    if ((row.locale !== 'ru' && row.locale !== 'uz') || row.packageId !== 'custom') return invalid();
    const payload: ProposalPayload = {
      locale: row.locale as ProposalPayload['locale'], company: text(row.company, 200), objective: text(row.objective, 5000), packageId: 'custom',
      ...(row.contact === undefined ? {} : { contact: text(row.contact, 300) }),
      ...(row.scope === undefined ? {} : { scope: strings(row.scope, 30, 1000) }),
      ...(row.budgetTerms === undefined ? {} : { budgetTerms: text(row.budgetTerms, 2000) }),
    };
    return { type: 'proposal_pdf', payload };
  }
  return invalid();
}
export function documentId(value: string): string {
  if (!/^doc_[a-f0-9]{32}$/.test(value)) throw new DocumentError('not_found', 404);
  return value;
}
export function idempotencyKey(request: Request): string {
  const key = request.headers.get('Idempotency-Key') ?? '';
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new DocumentError('idempotency_required', 400);
  return key;
}
export async function hashDocument(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
