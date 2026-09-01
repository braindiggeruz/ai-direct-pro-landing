import type { Env } from '../_types';
import { normalizeBunzyArticle, parseBunzyEnvelope } from '../platform/bunzy/content';
import { sha256Hex, verifyBunzySignature } from '../platform/bunzy/security';
import {
  bunzyEventExists,
  persistBunzyEvent,
  recordBunzyTestEvent,
} from '../platform/bunzy/store';

const MAX_BODY_BYTES = 512_000;

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Alt-Svc': 'clear',
    },
  });
}

function safeCode(error: unknown): string {
  if (!(error instanceof Error)) return 'webhook_processing_failed';
  const allowed = new Set([
    'invalid_payload',
    'unsupported_event_type',
    'missing_article',
    'invalid_article_slug',
    'missing_markdown',
    'article_too_large',
    'empty_article',
    'missing_title',
    'missing_description',
  ]);
  return allowed.has(error.message) ? error.message : 'webhook_processing_failed';
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.BUNZY_WEBHOOK_SECRET) {
    console.error('bunzy_webhook_not_configured');
    return json(503, { message: 'Webhook is not configured' });
  }
  if (!env.GPTBOT_DRAFTS_DB) return json(503, { message: 'Content store is unavailable' });
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/json')) {
    return json(415, { message: 'Content-Type must be application/json' });
  }
  const announcedLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(announcedLength) && announcedLength > MAX_BODY_BYTES) {
    return json(413, { message: 'Payload too large' });
  }

  const rawBody = await request.arrayBuffer();
  if (rawBody.byteLength === 0) return json(400, { message: 'Empty payload' });
  if (rawBody.byteLength > MAX_BODY_BYTES) return json(413, { message: 'Payload too large' });
  const validSignature = await verifyBunzySignature(
    rawBody,
    env.BUNZY_WEBHOOK_SECRET,
    request.headers.get('x-bunzy-signature'),
  );
  if (!validSignature) return json(401, { message: 'Invalid signature' });

  const receivedAt = new Date().toISOString();
  try {
    const payload = JSON.parse(new TextDecoder().decode(rawBody)) as unknown;
    const envelope = parseBunzyEnvelope(payload, env.BUNZY_DEFAULT_LOCALE, receivedAt);
    const eventId = await sha256Hex(rawBody);
    if (await bunzyEventExists(env.GPTBOT_DRAFTS_DB, eventId)) {
      return json(200, { message: 'Already received', duplicate: true });
    }
    if (envelope.test) {
      await recordBunzyTestEvent(env.GPTBOT_DRAFTS_DB, envelope, eventId, receivedAt);
      return json(200, { message: 'Test received' });
    }
    const normalized = envelope.eventType === 'article.unpublished'
      ? null
      : normalizeBunzyArticle(envelope);
    await persistBunzyEvent(
      env.GPTBOT_DRAFTS_DB,
      envelope,
      eventId,
      receivedAt,
      normalized,
    );
    console.log(JSON.stringify({
      event: 'bunzy_webhook_processed',
      eventType: envelope.eventType,
      locale: envelope.locale,
      slug: envelope.slug,
    }));
    return json(200, { message: 'Received' });
  } catch (error) {
    const code = safeCode(error);
    console.error(JSON.stringify({ event: 'bunzy_webhook_failed', code }));
    const clientError = code !== 'webhook_processing_failed';
    return json(clientError ? 400 : 503, { message: clientError ? code : 'Webhook processing failed' });
  }
};

export const onRequest: PagesFunction<Env> = async () => json(405, { message: 'Use POST' });
