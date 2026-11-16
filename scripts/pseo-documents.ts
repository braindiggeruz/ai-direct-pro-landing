import fs from 'node:fs';
import path from 'node:path';
import type { BlogArticle } from '../src/shared/types';
import { PSEO_DOCUMENT_SLUGS } from '../src/shared/pseo20';
import { escapeHtml } from './widgets/html';

interface DocumentSample { slug: string; article: string; title: string; subtitle: string; preview: string[] }
let samples: DocumentSample[] | undefined;
export function isPseoDocument(article: BlogArticle): boolean {
  return article.locale === 'uz' && PSEO_DOCUMENT_SLUGS.some((slug) => article.url === `/uz/blog/${slug}/`);
}
export function renderPseoDocument(article: BlogArticle): string {
  if (!isPseoDocument(article)) return '';
  samples ??= JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../content/pseo/documents-20261108.json'), 'utf8')) as DocumentSample[];
  const item = samples.find((sample) => sample.article === article.url && PSEO_DOCUMENT_SLUGS.some((slug) => slug === sample.slug));
  if (!item || !Array.isArray(item.preview) || item.preview.length < 2) throw new Error(`${article.url}: missing original document sample`);
  return `<aside class="ps-document" data-pseo-document aria-labelledby="document-download-title">
    <p class="ps-eyebrow">Tahrirlanadigan namuna</p>
    <h2 id="document-download-title">Namuna faylini yuklab oling</h2>
    <p>${escapeHtml(item.subtitle)}</p>
    <div class="ps-actions"><a class="ps-primary" href="/downloads/pseo-20261108/${item.slug}.docx" download>Word · DOCX ↓</a><a class="ps-secondary" href="/downloads/pseo-20261108/${item.slug}.pdf" download>Ko‘rish uchun PDF ↓</a></div>
    <p class="ps-note">Bepul, ro‘yxatdan o‘tish shart emas. Fayldagi qavsli joylarni o‘zingizning qurilmangizda to‘ldiring. Maqolada namuna va tekshirish ro‘yxati bor.</p>
    <p class="ps-note">Boshqa hujjat kerakmi? <a href="/uz/hujjat-namunalari/" class="text-brand-cyan underline">Barcha hujjat namunalari</a> sahifasidan tanlang.</p>
  </aside>`;
}
