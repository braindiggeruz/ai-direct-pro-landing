import type { BlogArticle, BodyBlock, FaqItem, InternalLink, Locale } from '../../../src/shared/types';

export const BUNZY_EVENT_TYPES = [
  'article.published',
  'article.updated',
  'article.unpublished',
] as const;

export type BunzyEventType = (typeof BUNZY_EVENT_TYPES)[number];

export interface BunzyEnvelope {
  eventType: BunzyEventType;
  test: boolean;
  article: Record<string, unknown>;
  locale: Locale;
  slug: string;
  occurredAt: string;
}

export interface StoredBunzyArticle {
  locale: Locale;
  slug: string;
  status: 'published' | 'unpublished';
  article: BlogArticle | null;
  markdown: string | null;
  sourceUpdatedAt: string;
  payloadDigest: string;
}

const MAX_MARKDOWN_BYTES = 400_000;
const MAX_TITLE = 78;
const MAX_DESCRIPTION = 180;
const MAX_H1 = 140;
const SAFE_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function nested(record: Record<string, unknown>, key: string): Record<string, unknown> {
  return objectValue(record[key]) ?? {};
}

function clipped(value: string, limit: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

function validIso(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function normalizeLocale(value: unknown, fallback: string | undefined): Locale {
  const candidate = stringValue(value, fallback, 'ru').toLowerCase().split(/[-_]/)[0];
  return candidate === 'uz' ? 'uz' : 'ru';
}

function normalizeSlug(value: unknown): string {
  const slug = stringValue(value).toLowerCase();
  if (!SAFE_SLUG.test(slug)) {
    throw new Error('invalid_article_slug');
  }
  return slug;
}

function safeTarget(value: string): string | null {
  const target = value.trim();
  if (target.startsWith('/') && !target.startsWith('//')) return target;
  try {
    const url = new URL(target);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeImage(value: string): string | null {
  const target = safeTarget(value);
  if (!target) return null;
  return target.startsWith('/') || target.startsWith('https://') ? target : null;
}

function plainInline(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function paragraphBlock(value: string): BodyBlock | null {
  const links: NonNullable<BodyBlock['links']> = [];
  let sequence = 0;
  const replaced = value.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, rawAnchor: string, rawTarget: string) => {
    const target = safeTarget(rawTarget);
    if (!target) return plainInline(rawAnchor);
    const token = `bunzy_link_${sequence++}`;
    links.push({ token, target, anchor: plainInline(rawAnchor) });
    return `{${token}}`;
  });
  const text = plainInline(replaced);
  if (!text) return null;
  return links.length > 0 ? { type: 'linkp', text, links } : { type: 'p', text };
}

function headingId(value: string, index: number): string {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return ascii || `section-${index}`;
}

/** Converts Bunzy markdown into the site's escaped, allow-listed body blocks. */
export function bunzyMarkdownToBlocks(markdown: string): BodyBlock[] {
  const clean = markdown.split(String.fromCharCode(0)).join('').slice(0, MAX_MARKDOWN_BYTES);
  const lines = clean.replace(/\r\n?/g, '\n').split('\n');
  const blocks: BodyBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let inFence = false;

  const flushParagraph = () => {
    const block = paragraphBlock(paragraph.join(' '));
    if (block) blocks.push(block);
    paragraph = [];
  };
  const flushList = () => {
    const items = list.map(plainInline).filter(Boolean).slice(0, 100);
    if (items.length) blocks.push({ type: 'list', items });
    list = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^```/.test(line)) {
      flushParagraph();
      flushList();
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      if (line) paragraph.push(line);
      continue;
    }
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const image = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
    if (image) {
      flushParagraph();
      flushList();
      const src = safeImage(image[2]);
      const alt = plainInline(image[1]) || 'Иллюстрация к статье';
      if (src) blocks.push({ type: 'figure', src, alt, caption: plainInline(image[3] || '') || undefined });
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const text = plainInline(heading[2]);
      if (text && heading[1].length >= 2) {
        blocks.push({ type: heading[1].length === 2 ? 'h2' : 'h3', text, id: headingId(text, blocks.length + 1) });
      }
      continue;
    }
    const item = line.match(/^(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
    if (item) {
      flushParagraph();
      list.push(item[1]);
      continue;
    }
    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      const text = plainInline(quote[1]);
      if (text) blocks.push({ type: 'quote', text });
      continue;
    }
    if (/^([-*_])\1{2,}$/.test(line)) {
      flushParagraph();
      flushList();
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks.slice(0, 500);
}

function normalizeKeywords(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return [...new Set(raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => clipped(plainInline(item), 80))
    .filter(Boolean))].slice(0, 30);
}

function normalizeFaq(value: unknown): FaqItem[] {
  if (!Array.isArray(value)) return [];
  const faq: FaqItem[] = [];
  for (const item of value) {
    const row = objectValue(item);
    if (!row) continue;
    const q = clipped(plainInline(stringValue(row.q, row.question, row.title)), 240);
    const a = clipped(plainInline(stringValue(row.a, row.answer, row.text)), 1_500);
    if (q && a) faq.push({ q, a });
    if (faq.length >= 20) break;
  }
  return faq;
}

function getMarkdown(article: Record<string, unknown>): string {
  const content = nested(article, 'content');
  return stringValue(
    article.markdown,
    article.markdown_content,
    content.markdown,
    article.body_markdown,
    article.body,
  );
}

export function parseBunzyEnvelope(payload: unknown, defaultLocale: string | undefined, receivedAt: string): BunzyEnvelope {
  const root = objectValue(payload);
  if (!root) throw new Error('invalid_payload');
  const eventType = stringValue(root.event_type, root.eventType);
  if (!(BUNZY_EVENT_TYPES as readonly string[]).includes(eventType)) {
    throw new Error('unsupported_event_type');
  }
  const data = objectValue(root.data) ?? {};
  const article = objectValue(data.article) ?? objectValue(root.article);
  if (!article) throw new Error('missing_article');
  const locale = normalizeLocale(
    article.locale ?? article.language ?? data.locale ?? root.locale,
    defaultLocale,
  );
  const slug = normalizeSlug(article.slug);
  const occurredAt = validIso(
    root.occurred_at
      ?? root.created_at
      ?? root.timestamp
      ?? data.occurred_at
      ?? article.updated_at
      ?? article.updatedAt
      ?? article.published_at
      ?? article.publishedAt,
    receivedAt,
  );
  return {
    eventType: eventType as BunzyEventType,
    test: root.test === true,
    article,
    locale,
    slug,
    occurredAt,
  };
}

export function normalizeBunzyArticle(envelope: BunzyEnvelope): { article: BlogArticle; markdown: string } {
  const source = envelope.article;
  const seo = nested(source, 'seo');
  const markdown = getMarkdown(source);
  if (!markdown) throw new Error('missing_markdown');
  if (new TextEncoder().encode(markdown).byteLength > MAX_MARKDOWN_BYTES) {
    throw new Error('article_too_large');
  }
  const body = bunzyMarkdownToBlocks(markdown);
  if (body.length === 0) throw new Error('empty_article');

  const rawTitle = stringValue(seo.title, seo.meta_title, seo.metaTitle, source.title, source.headline);
  const rawH1 = stringValue(source.h1, source.headline, source.title, rawTitle);
  if (!rawTitle || !rawH1) throw new Error('missing_title');
  const firstParagraph = body.find((block) => block.type === 'p' || block.type === 'linkp')?.text ?? '';
  const rawDescription = stringValue(
    seo.description,
    seo.meta_description,
    seo.metaDescription,
    source.description,
    source.excerpt,
    firstParagraph,
  );
  if (!rawDescription) throw new Error('missing_description');

  const locale = envelope.locale;
  const url = `/${locale}/blog/${envelope.slug}/`;
  const moneyPage = locale === 'uz' ? '/uz/ai-bot-yoki-menejer/' : '/ru/ai-bot-dlya-biznesa/';
  const relatedAnchor = locale === 'uz' ? 'Biznes uchun AI-bot imkoniyatlari' : 'Как AI-бот помогает бизнесу';
  const internalLinks: InternalLink[] = [{
    target: moneyPage,
    anchor: relatedAnchor,
    locale,
    type: 'block',
    reason: 'Bunzy article conversion path',
    priority: 1,
    status: 'active',
  }];
  const faqSource = source.faq ?? seo.faq;
  const faq = normalizeFaq(faqSource);
  const keywords = normalizeKeywords(seo.keywords ?? source.keywords ?? source.tags);
  const ogImage = safeImage(stringValue(
    seo.og_image,
    seo.ogImage,
    source.og_image,
    source.ogImage,
    source.featured_image,
    source.featuredImage,
    source.cover_image,
    source.coverImage,
  )) ?? undefined;
  const publishedAt = validIso(
    source.published_at ?? source.publishedAt ?? source.created_at ?? source.createdAt,
    envelope.occurredAt,
  );
  const modifiedAt = validIso(source.updated_at ?? source.updatedAt, envelope.occurredAt);

  return {
    markdown,
    article: {
      status: 'published',
      locale,
      slug: envelope.slug,
      url,
      title: clipped(plainInline(rawTitle), MAX_TITLE),
      description: clipped(plainInline(rawDescription), MAX_DESCRIPTION),
      h1: clipped(plainInline(rawH1), MAX_H1),
      topicCluster: clipped(plainInline(stringValue(source.category, source.topic, source.topic_cluster)), 80) || undefined,
      targetMoneyPage: moneyPage,
      keywords,
      intro: clipped(plainInline(stringValue(source.excerpt, source.description, firstParagraph)), 500),
      body,
      faq,
      cta: {
        label: locale === 'uz' ? 'AI-botni muhokama qilish' : 'Обсудить AI-бота',
        href: 'https://t.me/XGame_changerx',
      },
      internalLinks,
      ogTitle: clipped(plainInline(stringValue(seo.og_title, seo.ogTitle, rawTitle)), MAX_TITLE),
      ogDescription: clipped(plainInline(stringValue(seo.og_description, seo.ogDescription, rawDescription)), MAX_DESCRIPTION),
      ogImage,
      canonical: `https://gptbot.uz${url}`,
      robotsIndex: true,
      robotsFollow: true,
      author: clipped(plainInline(stringValue(source.author_name, source.authorName, source.author)), 100) || undefined,
      datePublished: publishedAt,
      dateModified: modifiedAt,
      schemaTypes: faq.length ? ['Article', 'BreadcrumbList', 'FAQPage'] : ['Article', 'BreadcrumbList'],
      createdAt: publishedAt,
      updatedAt: modifiedAt,
    },
  };
}

export function articleToMarkdown(article: BlogArticle): string {
  const lines = [`# ${article.h1}`, '', article.description, ''];
  for (const block of article.body) {
    if (block.type === 'h2') lines.push(`## ${block.text ?? ''}`, '');
    else if (block.type === 'h3') lines.push(`### ${block.text ?? ''}`, '');
    else if (block.type === 'p' || block.type === 'linkp') lines.push(block.text ?? '', '');
    else if (block.type === 'quote') lines.push(`> ${block.text ?? ''}`, '');
    else if (block.type === 'list') lines.push(...(block.items ?? []).map((item) => `- ${item}`), '');
    else if ((block.type === 'image' || block.type === 'figure') && block.src) {
      lines.push(`![${block.alt ?? ''}](${block.src})`, '');
    }
  }
  return `${lines.join('\n').trim()}\n`;
}
