// The Telegram end of the web → Telegram handoff.
//
// Somebody was talking to the free AI chat on gptbot.uz, hit the hourly cap
// (or simply chose to continue elsewhere), and tapped a link. Telegram hands
// us one thing: the /start payload. This module turns that payload into two
// outcomes and nothing else:
//
//   1. the person is greeted as a continuation rather than a stranger, in the
//      language their web session was in;
//   2. the owner learns that somebody arrived, with enough context to answer.
//
// Everything here is written around one assumption: THE PAYLOAD IS HOSTILE.
// It is public, it sits in the person's message history, anyone can type it
// into the bot, and a stranger can replay one they saw over a shoulder. So:
//
//   - the shape is checked before any lookup, so a normal `/start site_uz`
//     and a probe like `/start ../../etc` never reach D1 at all;
//   - the claim itself is single-use and expiring (functions/lib/gpt-chat/
//     handoff.ts owns that);
//   - NOTHING that was stored against the token is ever echoed back into the
//     chat. The greeting is generic. A guessed token therefore buys the
//     guesser exactly one thing: a greeting they could have had by typing
//     /start. The page, the session id and the message count go to the owner,
//     who already owns that data, and never to whoever redeemed the link.
//
// The transcript is deliberately absent from both directions. The person was
// told, on the site, that opening Telegram continues the conversation — not
// that their chat would be forwarded to anyone. Only the lead form asks for
// that, separately and explicitly, and only it sends it.
import { claimHandoff, HANDOFF_PAYLOAD_RE } from '../gpt-chat/handoff';
import { ensureSchema } from '../gpt-chat/schema';
import { clampEscaped, sendOwnerAlert, telegramHandleUrl, type RenderedAlert } from '../gpt-chat/notify';
import { consumeRateLimit, HOUR_MS } from '../gpt-chat/rate-limit';
import { resolveBridgeLimits, type BridgeEnv } from '../gpt-chat/bridge-env';
import type { Locale } from './store';

/** Who arrived, as far as Telegram will tell us. */
export interface ArrivalIdentity {
  /**
   * Raw Telegram user id. Used ONLY in the owner's own alert, so he can find
   * the chat. Never written to an analytics row — `pseudo` is for that.
   */
  userId: number;
  username?: string;
  firstName?: string;
  /** Pseudonymous, salted key. This is what is stored, everywhere. */
  pseudo: string;
}

/** What the redeemed token was worth. */
export interface WebArrival {
  sessionId: string | null;
  locale: Locale;
  /** Same-site path of the page the chat was open on. Owner-facing only. */
  pageUrl: string | null;
  intent: string | null;
  /** When the link was minted on the site. */
  createdAt: string;
  /** When it was redeemed here. */
  claimedAt: string;
  /** Messages in that web session, both sides. */
  messageCount: number;
  /** How many of them the person wrote. */
  personMessageCount: number;
}

/**
 * Cheap, allocation-free shape test. `/start` payloads are attacker-supplied,
 * so this gate runs before anything touches the database — and before the
 * existing `site_ru|site_uz|share|direct` switch, which it deliberately does
 * not overlap.
 */
export function isWebHandoffPayload(payload: string): boolean {
  return HANDOFF_PAYLOAD_RE.test(payload);
}

/** Both sides' message counts for one web session. Best-effort: 0 on failure. */
export async function countSessionMessages(
  db: D1Database,
  sessionId: string,
): Promise<{ total: number; fromPerson: number }> {
  try {
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) AS from_person
         FROM gpt_messages WHERE session_id = ? AND role IN ('user','assistant')`,
      )
      .bind(sessionId)
      .first<{ total: number | null; from_person: number | null }>();
    return { total: Number(row?.total ?? 0), fromPerson: Number(row?.from_person ?? 0) };
  } catch {
    return { total: 0, fromPerson: 0 };
  }
}

/**
 * Redeem a `/start w_…` payload.
 *
 * Returns null for every unhappy path there is — malformed, unknown, expired,
 * already claimed, no schema, D1 down. The caller must treat null as "this is
 * an ordinary /start", because from the person's point of view it is: they
 * tapped a link, and a link that has gone stale is not something they can act
 * on. An error message here would only be noise.
 */
export async function claimWebHandoff(
  db: D1Database,
  payload: string,
  identity: ArrivalIdentity,
  now = new Date(),
): Promise<WebArrival | null> {
  if (!isWebHandoffPayload(payload)) return null;
  try {
    await ensureSchema(db);
    // `claimedBy` is the pseudonymous key by contract — never the Telegram id,
    // which the website's own tables have no business holding.
    const claim = await claimHandoff(db, payload, { claimedBy: identity.pseudo, now });
    if (!claim.ok) return null;
    const counts = claim.sessionId
      ? await countSessionMessages(db, claim.sessionId)
      : { total: 0, fromPerson: 0 };
    return {
      sessionId: claim.sessionId,
      locale: claim.locale,
      pageUrl: claim.pageUrl,
      intent: claim.intent,
      createdAt: claim.createdAt,
      claimedAt: claim.claimedAt,
      messageCount: counts.total,
      personMessageCount: counts.fromPerson,
    };
  } catch (e) {
    // A broken bridge must never cost the person their greeting.
    console.error(`tg.handoff: claim failed (${(e as Error).name})`);
    return null;
  }
}

// ── The owner's alert ───────────────────────────────────────────────────────

const MAX_FIELD_CHARS = 200;

function stamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function line(label: string, value: string | null | undefined): string {
  return value ? `<b>${label}:</b> ${clampEscaped(value, MAX_FIELD_CHARS)}\n` : '';
}

/** "Азиз @azizbek (id 12345)" — whatever parts Telegram actually gave us. */
export function describeIdentity(identity: ArrivalIdentity): string {
  const parts: string[] = [];
  if (identity.firstName) parts.push(identity.firstName);
  if (identity.username) parts.push(`@${identity.username}`);
  parts.push(`id ${identity.userId}`);
  return parts.join(' ');
}

/**
 * Pure. One message, everything needed to answer well, nothing the person did
 * not agree to hand over: which page and language brought them, how much of a
 * conversation they already had, and how to reply.
 *
 * The transcript is not here and must not be added: this route carries no
 * consent to forward it. The last line says so out loud, so a missing chat
 * log reads as a rule rather than as a bug.
 */
export function buildArrivalAlert(arrival: WebArrival, identity: ArrivalIdentity): RenderedAlert {
  const head = '🔗 <b>Человек перешёл из AI-чата на сайте в Telegram</b>\n\n';
  const messages = arrival.sessionId
    ? `${arrival.messageCount} (из них от человека: ${arrival.personMessageCount})`
    : 'сессия не передана';
  const body =
    line('Язык', arrival.locale === 'uz' ? 'узбекский' : 'русский')
    + line('Страница', arrival.pageUrl || 'не передана')
    + line('Запрос', arrival.intent)
    + line('Сообщений на сайте', messages)
    + line('Telegram', describeIdentity(identity))
    + line('Сессия', arrival.sessionId)
    + line('Ссылка выдана', stamp(arrival.createdAt))
    + line('Открыл бота', stamp(arrival.claimedAt));

  const tail = '\n<i>Переписку с сайта бот сюда не переносит — согласия на это не спрашивали. '
    + 'Человек уже в чате с ботом, ему можно просто ответить.</i>';

  // A t.me button only for a handle Telegram will actually resolve; a bad URL
  // fails the whole sendMessage, and a lost alert is worse than a lost button.
  const url = identity.username ? telegramHandleUrl('telegram', `@${identity.username}`) : null;
  return {
    text: `${head}${body}${tail}`,
    ...(url ? { keyboard: [[{ text: 'Написать в Telegram', url }]] } : {}),
  };
}

// ── Delivery ────────────────────────────────────────────────────────────────

function eventId(): string {
  return `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

/** Best-effort funnel breadcrumb in the web chat's own event table. */
async function recordGptEvent(
  db: D1Database,
  sessionId: string | null,
  eventName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await db
      .prepare('INSERT INTO gpt_events (id, session_id, user_id, event_name, payload_json, created_at) VALUES (?,?,?,?,?,?)')
      .bind(eventId(), sessionId, null, eventName, JSON.stringify(payload), new Date().toISOString())
      .run();
  } catch {
    /* analytics are best-effort; the person is already being served */
  }
}

/**
 * Tell the owner, then write down what happened.
 *
 * Delivery goes through sendOwnerAlert — the bridge's helper, which owns the
 * credentials, the fallbacks and the "not configured" silence. There is no
 * second sender here, and no second set of env vars.
 *
 * The hourly ceiling is deliberately the SAME counter the lead endpoint uses
 * ('lead_notify'/'owner'): the owner has one phone, so leads and arrivals
 * share one budget. Past it the push is muted and the breadcrumb still lands.
 */
export async function notifyOwnerOfArrival(
  env: BridgeEnv,
  db: D1Database,
  arrival: WebArrival,
  identity: ArrivalIdentity,
): Promise<void> {
  await recordGptEvent(db, arrival.sessionId, 'GPTChatHandoffClaimed', {
    locale: arrival.locale,
    pageUrl: arrival.pageUrl,
    messageCount: arrival.messageCount,
    // Pseudonymous only: the raw Telegram id belongs in the owner's alert,
    // not in a table anybody may later export.
    claimedBy: identity.pseudo,
  });

  const limits = resolveBridgeLimits(env);
  const ceiling = await consumeRateLimit(db, 'lead_notify', 'owner', {
    limit: limits.ownerAlertsPerHour,
    windowMs: HOUR_MS,
  });
  if (!ceiling.allowed) {
    await recordGptEvent(db, arrival.sessionId, 'GPTChatHandoffNotifySkipped', {
      reason: 'muted',
      count: ceiling.count,
    });
    return;
  }

  const result = await sendOwnerAlert(env, buildArrivalAlert(arrival, identity));
  if (result.status === 'sent') {
    await recordGptEvent(db, arrival.sessionId, 'GPTChatHandoffNotified', { source: result.source });
    return;
  }
  if (result.status === 'skipped_unconfigured') {
    await recordGptEvent(db, arrival.sessionId, 'GPTChatHandoffNotifySkipped', { reason: 'unconfigured' });
    return;
  }
  console.error(`tg.handoff: owner alert failed code=${result.errorCode ?? '?'}`);
  await recordGptEvent(db, arrival.sessionId, 'GPTChatHandoffNotifyFailed', {
    errorCode: result.errorCode ?? null,
  });
}
