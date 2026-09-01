import type { BlogArticle, Locale } from '../../../src/shared/types';
import type { BunzyEnvelope } from './content';

export interface BunzyArticleRow {
  locale: Locale;
  slug: string;
  status: 'published' | 'unpublished';
  title: string | null;
  description: string | null;
  article_json: string | null;
  source_markdown: string | null;
  source_updated_at: string;
  payload_digest: string;
  published_at: string | null;
  updated_at: string;
}

export async function bunzyEventExists(db: D1Database, eventId: string): Promise<boolean> {
  const row = await db.prepare('SELECT event_id FROM bunzy_webhook_events WHERE event_id = ? LIMIT 1')
    .bind(eventId)
    .first<{ event_id: string }>();
  return Boolean(row);
}

export async function recordBunzyTestEvent(
  db: D1Database,
  envelope: BunzyEnvelope,
  eventId: string,
  receivedAt: string,
): Promise<void> {
  await db.prepare(`
    INSERT INTO bunzy_webhook_events
      (event_id, event_type, is_test, locale, slug, received_at, status)
    VALUES (?, ?, 1, ?, ?, ?, 'test_received')
    ON CONFLICT(event_id) DO NOTHING
  `).bind(eventId, envelope.eventType, envelope.locale, envelope.slug, receivedAt).run();
}

export async function persistBunzyEvent(
  db: D1Database,
  envelope: BunzyEnvelope,
  eventId: string,
  receivedAt: string,
  normalized: { article: BlogArticle; markdown: string } | null,
): Promise<void> {
  const status = envelope.eventType === 'article.unpublished' ? 'unpublished' : 'published';
  const article = normalized?.article ?? null;
  const eventStatement = db.prepare(`
    INSERT INTO bunzy_webhook_events
      (event_id, event_type, is_test, locale, slug, received_at, status)
    VALUES (?, ?, 0, ?, ?, ?, 'processed')
    ON CONFLICT(event_id) DO NOTHING
  `).bind(eventId, envelope.eventType, envelope.locale, envelope.slug, receivedAt);
  const articleStatement = db.prepare(`
    INSERT INTO bunzy_articles (
      locale, slug, status, title, description, article_json, source_markdown,
      source_updated_at, payload_digest, published_at, updated_at, unpublished_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(locale, slug) DO UPDATE SET
      status = excluded.status,
      title = excluded.title,
      description = excluded.description,
      article_json = excluded.article_json,
      source_markdown = excluded.source_markdown,
      source_updated_at = excluded.source_updated_at,
      payload_digest = excluded.payload_digest,
      published_at = COALESCE(bunzy_articles.published_at, excluded.published_at),
      updated_at = excluded.updated_at,
      unpublished_at = excluded.unpublished_at
    WHERE bunzy_articles.source_updated_at <= excluded.source_updated_at
  `).bind(
    envelope.locale,
    envelope.slug,
    status,
    article?.title ?? null,
    article?.description ?? null,
    article ? JSON.stringify(article) : null,
    normalized?.markdown ?? null,
    envelope.occurredAt,
    eventId,
    article?.datePublished ?? null,
    receivedAt,
    status === 'unpublished' ? receivedAt : null,
  );
  await db.batch([eventStatement, articleStatement]);
}

export async function getPublishedBunzyArticle(
  db: D1Database,
  locale: Locale,
  slug: string,
): Promise<BunzyArticleRow | null> {
  return db.prepare(`
    SELECT locale, slug, status, title, description, article_json, source_markdown,
           source_updated_at, payload_digest, published_at, updated_at
    FROM bunzy_articles
    WHERE locale = ? AND slug = ? AND status = 'published'
    LIMIT 1
  `).bind(locale, slug).first<BunzyArticleRow>();
}

export async function listPublishedBunzyArticles(
  db: D1Database,
  locale?: Locale,
): Promise<BunzyArticleRow[]> {
  const statement = locale
    ? db.prepare(`
        SELECT locale, slug, status, title, description, article_json, source_markdown,
               source_updated_at, payload_digest, published_at, updated_at
        FROM bunzy_articles
        WHERE locale = ? AND status = 'published'
        ORDER BY source_updated_at DESC
        LIMIT 200
      `).bind(locale)
    : db.prepare(`
        SELECT locale, slug, status, title, description, article_json, source_markdown,
               source_updated_at, payload_digest, published_at, updated_at
        FROM bunzy_articles
        WHERE status = 'published'
        ORDER BY source_updated_at DESC
        LIMIT 500
      `);
  const result = await statement.all<BunzyArticleRow>();
  return result.results;
}

export function articleFromRow(row: BunzyArticleRow): BlogArticle | null {
  if (!row.article_json) return null;
  try {
    return JSON.parse(row.article_json) as BlogArticle;
  } catch {
    return null;
  }
}
