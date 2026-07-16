// GPTBot Javob — telegramMessageHandler. Zero-Prompt Reply Engine:
// forward/direct text → immediate ready-to-send reply → tone modifiers.
// No action menu before the result. Runs in the background (waitUntil);
// the webhook has already returned 200.
import type { Env } from '../../_types';
import { TelegramClient } from './client';
import type { TelegramConfig } from './config';
import * as S from './store';
import type { Locale } from './store';
import * as C from './i18n';
import { buildJavobReplyPrompt, buildJavobModifierPrompt, guessLanguage, JAVOB_PROMPT_VERSION, type JavobModifier } from './prompts';
import { classifyMessage } from './classify';
import { runJavobValidated } from './service';
import { decideUsage, consumeUsage, modifierCount, MAX_MODIFIERS_PER_ITEM } from './billing';

interface Deps {
  env: Env;
  db: D1Database;
  cfg: TelegramConfig;
  tg: TelegramClient;
}

interface TgFrom { id: number; language_code?: string; is_bot?: boolean }
interface TgMessage {
  chat: { id: number; type: string };
  from?: TgFrom;
  text?: string;
  forward_origin?: unknown;
  forward_date?: number;
  forward_from?: unknown;
  forward_from_chat?: unknown;
  forward_sender_name?: string;
}
interface TgCallback {
  id: string;
  from: TgFrom;
  data?: string;
  message?: { chat: { id: number }; message_id: number };
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallback;
}

const SHARE_EVERY = 5;      // share CTA on every Nth successful action
const FEEDBACK_AT = 3;      // first feedback ask after the 3rd action
const FEEDBACK_EVERY = 10;  // then every 10th

export function localeFromCode(code?: string): Locale {
  return code?.toLowerCase().startsWith('uz') ? 'uz' : 'ru';
}

export function isForward(msg: TgMessage): boolean {
  return !!(msg.forward_origin || msg.forward_date || msg.forward_from || msg.forward_from_chat || msg.forward_sender_name);
}

// ── Public entry ───────────────────────────────────────────────────────────
export async function handleUpdate(deps: Deps, update: TgUpdate): Promise<void> {
  try {
    if (update.callback_query) return await handleCallback(deps, update.callback_query, update.update_id);
    if (update.message) return await handleMessage(deps, update.message, update.update_id);
  } catch (e) {
    console.error('tg.handler error:', (e as Error).message);
  }
}

// ── Messages ───────────────────────────────────────────────────────────────
async function handleMessage(deps: Deps, msg: TgMessage, updateId: number): Promise<void> {
  const { db, cfg, tg } = deps;
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from || from.is_bot) return;

  if (msg.chat.type !== 'private') {
    if ((msg.text || '').startsWith('/start')) await tg.sendMessage(chatId, C.GROUP_NOTICE.ru);
    return;
  }

  const user = await S.upsertUser(db, from.id, localeFromCode(from.language_code));
  const locale = user.locale;
  const pseudo = await S.pseudoUser(from.id, cfg.hashSalt);
  const text = (msg.text || '').trim();

  if (text.startsWith('/')) return await handleCommand(deps, chatId, from.id, locale, text, pseudo);

  if (!text) {
    await tg.sendMessage(chatId, C.START[locale]);
    return;
  }

  if (text.length > cfg.maxInputChars) {
    await tg.sendMessage(chatId, C.ERR_TOO_LONG[locale](cfg.maxInputChars));
    return;
  }

  // Zero-Prompt Reply Engine: forward AND direct/copied text both produce a
  // ready reply immediately. No "what should I do?" menu.
  const forwarded = isForward(msg);
  const cls = classifyMessage(text);
  const itemId = await S.createItem(db, from.id, forwarded ? 'forward' : 'direct', text, cls.language, cfg.itemTtlMs);
  await S.setItemContext(db, itemId, cls.situation);
  await S.logEvent(db, forwarded ? 'javob_forward_received' : 'javob_message_received', pseudo, { locale, lang: cls.language });
  await S.logEvent(db, 'javob_context_detected', pseudo, { locale, situation: cls.situation });
  void S.cleanupExpired(db);

  if (cls.needsClarification) {
    await S.logEvent(db, 'javob_clarification_shown', pseudo, { locale });
    await tg.sendMessage(chatId, C.CLARIFY[locale], { keyboard: C.clarifyKeyboard(locale, itemId) });
    return;
  }

  await generateReply(deps, chatId, from.id, locale, pseudo, { id: itemId, source_text: text, source_language: cls.language }, `gen:${updateId}`);
}

async function handleCommand(deps: Deps, chatId: number, userId: number, locale: Locale, text: string, pseudo: string): Promise<void> {
  const { db, tg } = deps;
  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, '');
  const payload = text.slice(cmd.length).trim();

  switch (cmd) {
    case '/start': {
      const source = /^(site_ru|site_uz|share|direct)$/.test(payload) ? payload : 'direct';
      await S.logEvent(db, 'javob_bot_start', pseudo, { locale, source });
      await tg.sendMessage(chatId, C.START[locale]);
      await tg.sendMessage(chatId, C.CHOOSE_LANG[locale], { keyboard: C.langKeyboard() });
      return;
    }
    case '/new':
      await tg.sendMessage(chatId, C.START[locale]);
      return;
    case '/lang':
      await tg.sendMessage(chatId, C.CHOOSE_LANG[locale], { keyboard: C.langKeyboard() });
      return;
    case '/help':
      await tg.sendMessage(chatId, C.HELP[locale]);
      return;
    case '/privacy':
      await tg.sendMessage(chatId, C.PRIVACY[locale]);
      return;
    case '/plans': {
      const plans = await import('./billing').then((b) => b.listActivePlans(db));
      await S.logEvent(db, 'javob_plans_viewed', pseudo, { locale });
      await tg.sendMessage(chatId, C.plansText(locale, plans));
      return;
    }
    case '/delete_me':
      await S.deleteUserData(db, userId);
      await S.logEvent(db, 'javob_data_deleted', pseudo, {});
      await tg.sendMessage(chatId, C.DELETED[locale]);
      return;
    default:
      await tg.sendMessage(chatId, C.HELP[locale]);
  }
}

// ── Reply generation ───────────────────────────────────────────────────────
interface ItemLike { id: string; source_text: string; source_language: string | null }

async function totalActions(db: D1Database, userId: number): Promise<number> {
  const row = await db.prepare('SELECT total_actions AS t FROM telegram_users WHERE telegram_user_id = ?').bind(userId).first<{ t: number }>();
  return row?.t ?? 0;
}

async function generateReply(
  deps: Deps,
  chatId: number,
  userId: number,
  locale: Locale,
  pseudo: string,
  item: ItemLike,
  idemKey: string,
  audience?: string,
): Promise<void> {
  const { db, cfg, tg, env } = deps;

  const usage = await decideUsage(db, userId);
  if (!usage.allowed) {
    await S.logEvent(db, 'javob_limit_reached', pseudo, { locale, plan: usage.planCode, reason: usage.reason || 'period' });
    await tg.sendMessage(chatId, C.LIMIT_REACHED[locale], { keyboard: C.limitKeyboard(locale) });
    return;
  }
  if (usage.remainingToday === 1) await S.logEvent(db, 'javob_limit_warning', pseudo, { locale });

  await tg.sendChatAction(chatId);
  const srcLang = (item.source_language === 'ru' || item.source_language === 'uz') ? item.source_language : null;
  const prompt = buildJavobReplyPrompt(item.source_text, audience);
  const res = await runJavobValidated(env, prompt, cfg.maxOutputChars, {
    source: item.source_text,
    expectedLanguage: srcLang,
    mode: 'reply',
  });
  if (!res.ok || !res.text) {
    await S.logEvent(db, 'javob_reply_failed', pseudo, { locale, code: res.errorCode || 'unknown' });
    await tg.sendMessage(chatId, C.ERR_PROVIDER[locale], { keyboard: C.errorKeyboard(locale, item.id) });
    return;
  }

  const outLang = guessLanguage(res.text);
  const resultId = await S.saveResult(db, item.id, 'javob_reply', audience ? `ctx_${audience}` : null, res.text, res.provider, res.model ?? null, JAVOB_PROMPT_VERSION, outLang, res.latencyMs);
  await consumeUsage(db, userId, 'main_generation', idemKey, { itemId: item.id, resultId });
  await S.recordAction(db, userId);

  const total = await totalActions(db, userId);
  if (total === 2) await S.logEvent(db, 'javob_second_use', pseudo, { locale });
  if (total === 3) await S.logEvent(db, 'javob_third_use', pseudo, { locale });
  await S.logEvent(db, 'javob_reply_generated', pseudo, {
    locale, lang: item.source_language || 'other', outLang, model: res.model || '', latencyBucket: latencyBucket(res.latencyMs),
  });

  // The reply text is the whole message — clean for long-press copy.
  // (Bot API has no generic "copy arbitrary text" inline button; a fake one
  // is worse than none.)
  await tg.sendMessage(chatId, res.text, {
    keyboard: C.resultKeyboard(locale, item.id, outLang === 'uz' ? 'uz' : outLang === 'ru' ? 'ru' : 'other', !!cfg.botUsername && total > 0 && total % SHARE_EVERY === 0),
  });

  if (total === FEEDBACK_AT || (total > FEEDBACK_AT && total % FEEDBACK_EVERY === 0)) {
    await tg.sendMessage(chatId, C.FEEDBACK_Q[locale], { keyboard: C.feedbackKeyboard(locale, resultId) });
  }
}

function latencyBucket(ms: number): string {
  if (ms < 2000) return '<2s';
  if (ms < 5000) return '2-5s';
  if (ms < 10000) return '5-10s';
  return '>10s';
}

// ── Callbacks ──────────────────────────────────────────────────────────────
const MODIFIERS: ReadonlySet<string> = new Set(['shorter', 'softer', 'confident', 'alternative', 'to_ru', 'to_uz']);

async function handleCallback(deps: Deps, cq: TgCallback, updateId: number): Promise<void> {
  const { db, cfg, tg } = deps;
  await tg.answerCallbackQuery(cq.id); // clear the button spinner first
  const chatId = cq.message?.chat.id;
  if (!chatId) return;
  const userId = cq.from.id;
  const data = cq.data || '';
  const user = await S.upsertUser(db, userId, localeFromCode(cq.from.language_code));
  const locale = user.locale;
  const pseudo = await S.pseudoUser(userId, cfg.hashSalt);
  const parts = data.split(':');
  const kind = parts[0];

  if (kind === 'lang' && (parts[1] === 'ru' || parts[1] === 'uz')) {
    await S.setLocale(db, userId, parts[1]);
    await S.logEvent(db, 'javob_language_selected', pseudo, { locale: parts[1] });
    await tg.sendMessage(chatId, C.LANG_SET[parts[1] as Locale]);
    return;
  }

  if (kind === 'share') {
    if (!cfg.botUsername) {
      await tg.sendMessage(chatId, C.ERR_STALE[locale]);
      return;
    }
    await S.logEvent(db, 'telegram_share_clicked', pseudo, { locale });
    const { url } = C.shareText(locale, cfg.botUsername);
    const label = locale === 'ru' ? 'Открыть окно «Поделиться»' : 'Ulashish oynasini ochish';
    await tg.sendMessage(chatId, locale === 'ru' ? 'Поделитесь GPTBot с друзьями:' : 'GPTBot’ni do‘stlaringizga ulashing:', { keyboard: [[{ text: label, url }]] });
    return;
  }

  // Feedback: outcome only — never conversation text.
  if (kind === 'fb' && ['as_is', 'edited', 'unused'].includes(parts[1])) {
    const resultId = parts[2] || '';
    const owned = await S.getOwnedResult(db, resultId, userId);
    if (!owned) {
      await tg.sendMessage(chatId, C.ERR_STALE[locale]);
      return;
    }
    await S.logEvent(db, 'javob_feedback_submitted', pseudo, {
      locale, outcome: parts[1],
      resultId,
      model: owned.model || '', promptVersion: owned.prompt_version || '', outLang: owned.output_language || '',
    });
    await tg.sendMessage(chatId, C.FEEDBACK_THANKS[locale]);
    return;
  }

  // Everything below needs an owned, unexpired item.
  const itemId = parts[parts.length - 1];
  const item = await S.getOwnedItem(db, itemId, userId);
  if (!item) {
    await tg.sendMessage(chatId, C.ERR_STALE[locale]);
    return;
  }

  // Clarification answer → generate with audience context.
  if (kind === 'ctx' && ['client', 'colleague', 'manager', 'personal'].includes(parts[1])) {
    await S.setItemContext(db, itemId, parts[1]);
    return await generateReply(deps, chatId, userId, locale, pseudo, item, `gen:${updateId}`, parts[1]);
  }

  if (kind === 'retry') {
    return await generateReply(deps, chatId, userId, locale, pseudo, item, `gen:${updateId}`);
  }

  if (kind === 'jmod' && MODIFIERS.has(parts[1])) {
    return await runModifier(deps, chatId, userId, locale, pseudo, item, parts[1] as JavobModifier, updateId);
  }

  await tg.sendMessage(chatId, C.ERR_STALE[locale]);
}

async function runModifier(
  deps: Deps,
  chatId: number,
  userId: number,
  locale: Locale,
  pseudo: string,
  item: S.TgItemRow,
  modifier: JavobModifier,
  updateId: number,
): Promise<void> {
  const { db, cfg, tg, env } = deps;
  const last = await S.getLastResult(db, item.id);
  if (!last) {
    await tg.sendMessage(chatId, C.ERR_STALE[locale]);
    return;
  }

  const isAlternative = modifier === 'alternative';
  if (isAlternative) {
    // «Другой» = new main generation: counts against the plan.
    const usage = await decideUsage(db, userId);
    if (!usage.allowed) {
      await S.logEvent(db, 'javob_limit_reached', pseudo, { locale, plan: usage.planCode, reason: usage.reason || 'period' });
      await tg.sendMessage(chatId, C.LIMIT_REACHED[locale], { keyboard: C.limitKeyboard(locale) });
      return;
    }
  } else {
    // Tone/language modifiers: free, but capped per item against spam.
    const used = await modifierCount(db, userId, item.id);
    if (used >= MAX_MODIFIERS_PER_ITEM) {
      await tg.sendMessage(chatId, C.MODIFIER_CAP[locale]);
      return;
    }
  }

  await S.logEvent(db, isAlternative ? 'javob_alternative_generated' : 'javob_modifier_selected', pseudo, { locale, modifier });
  if (modifier === 'to_ru' || modifier === 'to_uz') await S.logEvent(db, 'javob_language_switched', pseudo, { locale, modifier });
  await tg.sendChatAction(chatId);

  const prompt = isAlternative
    ? buildJavobReplyPrompt(item.source_text!)
    : buildJavobModifierPrompt(modifier, item.source_text!, last.result_text);
  const expected: 'ru' | 'uz' | null =
    modifier === 'to_ru' ? 'ru' : modifier === 'to_uz' ? 'uz' : null;
  const res = await runJavobValidated(env, prompt, cfg.maxOutputChars, {
    source: item.source_text!,
    previous: isAlternative ? undefined : last.result_text,
    expectedLanguage: expected,
    mode: isAlternative ? 'reply' : 'modifier',
  });
  if (!res.ok || !res.text) {
    await S.logEvent(db, 'javob_reply_failed', pseudo, { locale, code: res.errorCode || 'unknown', modifier });
    await tg.sendMessage(chatId, C.ERR_PROVIDER[locale], { keyboard: C.errorKeyboard(locale, item.id) });
    return;
  }

  const outLang = guessLanguage(res.text);
  const resultId = await S.saveResult(db, item.id, 'javob_reply', modifier, res.text, res.provider, res.model ?? null, JAVOB_PROMPT_VERSION, outLang, res.latencyMs);
  await consumeUsage(db, userId, isAlternative ? 'main_generation' : 'modifier', `mod:${updateId}`, { itemId: item.id, resultId });
  await S.recordAction(db, userId);
  const total = await totalActions(db, userId);
  await S.logEvent(db, 'javob_reply_generated', pseudo, { locale, modifier, model: res.model || '', latencyBucket: latencyBucket(res.latencyMs) });

  await tg.sendMessage(chatId, res.text, {
    keyboard: C.resultKeyboard(locale, item.id, outLang === 'uz' ? 'uz' : outLang === 'ru' ? 'ru' : 'other', !!cfg.botUsername && total > 0 && total % SHARE_EVERY === 0),
  });
}
