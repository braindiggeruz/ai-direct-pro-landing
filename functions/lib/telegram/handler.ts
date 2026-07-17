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
import { decideUsage, decideAnalysisUsage, consumeUsage, modifierCount, MAX_MODIFIERS_PER_ITEM } from './billing';
import { downloadTelegramFile, transcribeAudio, VoicePipelineError } from './transcription';
import {
  analyzeTranscript,
  harmfulUseCategory,
  isLieDetectionQuestion,
  parseStoredSegments,
  TAHLIL_CONSENT_VERSION,
  type TranscriptAnalysis,
} from './analysis';
import { analysisFromStored, formatAnalysisReport, formatVerificationQuestions } from './analysis-report';

interface Deps {
  env: Env;
  db: D1Database;
  cfg: TelegramConfig;
  tg: TelegramClient;
}

interface TgFrom { id: number; language_code?: string; is_bot?: boolean }
interface TgMedia {
  file_id: string;
  file_unique_id?: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
  file_name?: string;
}
interface TgMessage {
  chat: { id: number; type: string };
  from?: TgFrom;
  text?: string;
  voice?: TgMedia;
  audio?: TgMedia;
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

  const media = msg.voice || msg.audio;
  if (media) return await handleVoiceMessage(deps, chatId, from.id, locale, pseudo, media, msg.audio ? 'audio' : 'voice', updateId);

  if (!text) {
    await tg.sendMessage(chatId, C.START[locale]);
    return;
  }

  if (text.length > cfg.maxInputChars) {
    await tg.sendMessage(chatId, C.ERR_TOO_LONG[locale](cfg.maxInputChars));
    return;
  }

  // Fixed local safety responses bypass every AI provider. A user asking for
  // a lie verdict or a harmful high-stakes use must never receive a generated
  // accusation disguised as analysis.
  const harmful = harmfulUseCategory(text);
  if (harmful) {
    await S.logEvent(db, 'harmful_use_detected', pseudo, { locale, category: harmful });
    await tg.sendMessage(chatId, C.analysisHarmRefusal(locale, harmful));
    return;
  }
  if (isLieDetectionQuestion(text)) {
    await S.logEvent(db, 'lie_question_detected', pseudo, { locale });
    await tg.sendMessage(chatId, C.ANALYSIS_LIE_BOUNDARY[locale]);
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

function durationBucket(seconds: number): string {
  if (seconds < 15) return '<15s';
  if (seconds < 60) return '15-60s';
  if (seconds < 180) return '1-3m';
  return '3-5m';
}

function sizeBucket(bytes: number): string {
  if (!bytes) return 'unknown';
  if (bytes < 1024 * 1024) return '<1mb';
  if (bytes < 5 * 1024 * 1024) return '1-5mb';
  if (bytes < 10 * 1024 * 1024) return '5-10mb';
  return '10-20mb';
}

async function handleVoiceMessage(
  deps: Deps,
  chatId: number,
  userId: number,
  locale: Locale,
  pseudo: string,
  media: TgMedia,
  mediaKind: 'voice' | 'audio',
  updateId: number,
): Promise<void> {
  const { db, cfg, tg, env } = deps;
  const duration = Math.max(0, Math.floor(Number(media.duration) || 0));
  const declaredSize = Math.max(0, Math.floor(Number(media.file_size) || 0));
  const voiceStartedAt = Date.now();

  await S.logEvent(db, 'voice_received', pseudo, {
    locale, mediaKind, durationBucket: durationBucket(duration), sizeBucket: sizeBucket(declaredSize),
  });

  if (duration < cfg.voiceMinSeconds) {
    await tg.sendMessage(chatId, C.VOICE_TOO_SHORT[locale](cfg.voiceMinSeconds));
    return;
  }
  if (duration > cfg.voiceMaxSeconds) {
    await tg.sendMessage(chatId, C.VOICE_TOO_LONG[locale]);
    return;
  }
  if (declaredSize > cfg.voiceMaxBytes) {
    await tg.sendMessage(chatId, C.VOICE_TOO_LARGE[locale]);
    return;
  }

  // Avoid paying for download/STT when the user's generation quota is gone.
  const usage = await decideUsage(db, userId);
  if (!usage.allowed) {
    await S.logEvent(db, 'javob_limit_reached', pseudo, { locale, plan: usage.planCode, reason: usage.reason || 'period' });
    await tg.sendMessage(chatId, C.LIMIT_REACHED[locale], { keyboard: C.limitKeyboard(locale) });
    return;
  }

  const processing = await tg.sendMessage(chatId, C.voiceProcessing(locale, duration));
  const processingMessageId = processing.result?.message_id;

  let downloaded: Awaited<ReturnType<typeof downloadTelegramFile>>;
  try {
    const file = await tg.getFile(media.file_id);
    if (!file.ok || !file.result?.file_path) throw new VoicePipelineError('download_failed');
    if ((file.result.file_size || 0) > cfg.voiceMaxBytes) throw new VoicePipelineError('too_large');
    downloaded = await downloadTelegramFile(cfg.token, file.result.file_path, cfg.voiceMaxBytes, 6_000);
  } catch (error) {
    const code = error instanceof VoicePipelineError ? error.code : 'download_failed';
    await S.logEvent(db, 'stt_failed', pseudo, { locale, stage: 'download', code });
    if (processingMessageId) await tg.deleteMessage(chatId, processingMessageId);
    await tg.sendMessage(chatId, code === 'too_large' ? C.VOICE_TOO_LARGE[locale] : C.VOICE_UNAVAILABLE[locale]);
    return;
  }

  await S.logEvent(db, 'stt_started', pseudo, {
    locale, durationBucket: durationBucket(duration), sizeBucket: sizeBucket(downloaded.bytes.byteLength),
  });

  let transcript: Awaited<ReturnType<typeof transcribeAudio>>;
  try {
    transcript = await transcribeAudio(env, downloaded.bytes, {
      mimeType: media.mime_type || downloaded.mimeType,
      fileName: media.file_name,
      timeoutMs: Math.min(cfg.sttTimeoutMs, 10_000),
      durationSeconds: duration,
    });
  } catch (error) {
    const code = error instanceof VoicePipelineError ? error.code : 'stt_failed';
    await S.logEvent(db, 'stt_failed', pseudo, { locale, stage: 'transcription', code });
    if (processingMessageId) await tg.deleteMessage(chatId, processingMessageId);
    await tg.sendMessage(chatId, code === 'empty_transcript' ? C.VOICE_UNCLEAR[locale] : C.VOICE_UNAVAILABLE[locale]);
    return;
  }

  const sourceText = transcript.text.replace(/\s+/g, ' ').trim().slice(0, cfg.voiceMaxTranscriptChars);
  if (!sourceText) {
    await S.logEvent(db, 'stt_failed', pseudo, { locale, stage: 'transcription', code: 'empty_transcript' });
    if (processingMessageId) await tg.deleteMessage(chatId, processingMessageId);
    await tg.sendMessage(chatId, C.VOICE_UNCLEAR[locale]);
    return;
  }
  if (processingMessageId) await tg.deleteMessage(chatId, processingMessageId);
  await tg.sendMessage(chatId, C.voiceTranscript(locale, duration, sourceText));
  await S.logEvent(db, 'stt_completed', pseudo, {
    locale, provider: transcript.provider, lang: transcript.language, latencyBucket: latencyBucket(transcript.latencyMs),
  });

  const classification = classifyMessage(sourceText, transcript.language);
  const itemId = await S.createItem(
    db,
    userId,
    'voice',
    sourceText,
    classification.language,
    cfg.itemTtlMs,
    duration,
    JSON.stringify(transcript.segments || []),
  );
  await S.setItemContext(db, itemId, classification.situation);
  await S.logEvent(db, 'javob_context_detected', pseudo, { locale, situation: classification.situation, sourceType: 'voice' });
  void S.cleanupExpired(db);

  if (classification.needsClarification) {
    await S.logEvent(db, 'javob_clarification_shown', pseudo, { locale, sourceType: 'voice' });
    await tg.sendMessage(chatId, C.CLARIFY[locale], { keyboard: C.clarifyKeyboard(locale, itemId) });
    return;
  }

  await generateReply(deps, chatId, userId, locale, pseudo, {
    id: itemId,
    source_text: sourceText,
    source_language: classification.language,
    source_type: 'voice',
    voice_duration_sec: duration,
    voice_started_at: voiceStartedAt,
    stt_provider: transcript.provider,
  }, `gen:${updateId}`);
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
interface ItemLike {
  id: string;
  source_text: string;
  source_language: string | null;
  source_type?: string;
  voice_duration_sec?: number | null;
  transcript_segments_json?: string | null;
  detected_context?: string | null;
  voice_started_at?: number;
  stt_provider?: string;
}

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
  const prompt = buildJavobReplyPrompt(item.source_text, audience, item.source_type === 'voice' ? srcLang : null);
  const res = await runJavobValidated(env, prompt, cfg.maxOutputChars, {
    source: item.source_text,
    expectedLanguage: srcLang,
    mode: 'reply',
    ...(item.source_type === 'voice' ? { timeoutMs: 8_000, maxModels: 1, validationRetry: false } : {}),
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
  if (item.source_type === 'voice') {
    await S.logEvent(db, 'voice_reply_generated', pseudo, {
      locale,
      lang: item.source_language || 'other',
      outLang,
      provider: item.stt_provider || 'stored',
      durationBucket: durationBucket(item.voice_duration_sec || 0),
      totalLatencyBucket: latencyBucket(item.voice_started_at ? Date.now() - item.voice_started_at : res.latencyMs),
    });
    await tg.sendMessage(chatId, C.RECOMMENDED_REPLY[locale]);
  }

  // The reply text is the whole message — clean for long-press copy.
  // (Bot API has no generic "copy arbitrary text" inline button; a fake one
  // is worse than none.)
  await tg.sendMessage(chatId, res.text, {
    keyboard: item.source_type === 'voice'
      ? C.voiceResultKeyboard(locale, item.id, outLang === 'uz' ? 'uz' : outLang === 'ru' ? 'ru' : 'other')
      : C.resultKeyboard(locale, item.id, outLang === 'uz' ? 'uz' : outLang === 'ru' ? 'ru' : 'other', !!cfg.botUsername && total > 0 && total % SHARE_EVERY === 0),
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

  // GPTBot Tahlil callbacks. Cached reports are always checked before consent
  // and quota so reopening a report is instant and free.
  if (kind === 'analyze') {
    await S.logEvent(db, 'analysis_requested', pseudo, {
      locale, sourceType: item.source_type, durationBucket: durationBucket(item.voice_duration_sec || 0),
    });
    const cached = await S.getOwnedAnalysis(db, item.id, userId);
    if (cached) return await sendStoredAnalysis(deps, chatId, locale, pseudo, item, cached, true);
    if (item.source_type !== 'voice') {
      await tg.sendMessage(chatId, C.ERR_STALE[locale]);
      return;
    }
    if (!await S.hasAnalysisConsent(db, userId, TAHLIL_CONSENT_VERSION)) {
      await S.logEvent(db, 'analysis_consent_shown', pseudo, { locale });
      await tg.sendMessage(chatId, C.ANALYSIS_CONSENT[locale], { keyboard: C.analysisConsentKeyboard(locale, item.id) });
      return;
    }
    return await runAnalysis(deps, chatId, userId, locale, pseudo, item);
  }

  if (kind === 'analysis_consent') {
    if (parts[1] === 'cancel') {
      await S.logEvent(db, 'analysis_consent_cancelled', pseudo, { locale });
      await tg.sendMessage(chatId, C.ANALYSIS_CANCELED[locale]);
      return;
    }
    if (parts[1] === 'accept') {
      await S.setAnalysisConsent(db, userId, TAHLIL_CONSENT_VERSION);
      await S.logEvent(db, 'analysis_consent_accepted', pseudo, { locale, version: TAHLIL_CONSENT_VERSION });
      return await runAnalysis(deps, chatId, userId, locale, pseudo, item);
    }
  }

  if (kind === 'analysis_questions') {
    const report = await S.getOwnedAnalysis(db, item.id, userId);
    const analysis = report ? analysisFromStored(report) : null;
    if (!report || !analysis) {
      await tg.sendMessage(chatId, C.ERR_STALE[locale]);
      return;
    }
    await S.logEvent(db, 'analysis_questions_opened', pseudo, { locale, count: analysis.questions.length });
    await tg.sendMessage(chatId, formatVerificationQuestions(analysis.questions, locale));
    return;
  }

  if (kind === 'analysis_details') {
    const report = await S.getOwnedAnalysis(db, item.id, userId);
    if (!report) {
      await tg.sendMessage(chatId, C.ERR_STALE[locale]);
      return;
    }
    await S.logEvent(db, 'analysis_details_viewed', pseudo, { locale });
    await tg.sendMessage(chatId, C.ANALYSIS_PAYWALL[locale], { keyboard: C.analysisPaywallKeyboard(locale, item.id) });
    return;
  }

  if (kind === 'analysis_pay_intent') {
    const report = await S.getOwnedAnalysis(db, item.id, userId);
    if (!report) {
      await tg.sendMessage(chatId, C.ERR_STALE[locale]);
      return;
    }
    // P0 measures demand only. No payment order, entitlement or fake checkout.
    await S.logEvent(db, 'payment_intent', pseudo, { locale, product: 'tahlil_day_pass', amountUzs: 4900 });
    await tg.sendMessage(chatId, C.ANALYSIS_PAYMENT_PENDING[locale]);
    return;
  }

  if (kind === 'analysis_later') {
    await S.logEvent(db, 'analysis_paywall_dismissed', pseudo, { locale });
    await tg.sendMessage(chatId, C.ANALYSIS_LATER[locale]);
    return;
  }

  if (kind === 'analysis_delete') {
    const report = await S.getOwnedAnalysis(db, item.id, userId);
    if (!report) {
      await tg.sendMessage(chatId, C.ERR_STALE[locale]);
      return;
    }
    await S.deleteAnalysisData(db, item.id, userId);
    await S.logEvent(db, 'analysis_deleted', pseudo, { locale });
    await tg.sendMessage(chatId, C.ANALYSIS_DELETED[locale]);
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
    if (item.source_type === 'voice' && parts[1] === 'alternative') {
      await tg.sendMessage(chatId, C.ERR_STALE[locale]);
      return;
    }
    return await runModifier(deps, chatId, userId, locale, pseudo, item, parts[1] as JavobModifier, updateId);
  }

  await tg.sendMessage(chatId, C.ERR_STALE[locale]);
}

function timestampedTranscript(segments: ReturnType<typeof parseStoredSegments>): string | null {
  if (!segments.length) return null;
  return segments
    .map((segment) => `[${C.formatVoiceDuration(segment.start)}-${C.formatVoiceDuration(segment.end)}] ${segment.text}`)
    .join('\n')
    .slice(0, 16_000);
}

async function sendStoredAnalysis(
  deps: Deps,
  chatId: number,
  locale: Locale,
  pseudo: string,
  item: S.TgItemRow,
  row: S.AnalysisReportRow,
  cached: boolean,
): Promise<void> {
  const analysis = analysisFromStored(row);
  if (!analysis) {
    await deps.tg.sendMessage(chatId, C.ANALYSIS_FAILED[locale]);
    return;
  }
  await S.logEvent(deps.db, cached ? 'analysis_cached_opened' : 'analysis_report_shown', pseudo, {
    locale,
    claimCount: analysis.claims.length,
    contradictionCount: analysis.contradictions.length,
    hedgingCount: analysis.hedging.length,
    questionCount: analysis.questions.length,
  });
  await deps.tg.sendMessage(chatId, formatAnalysisReport(analysis, locale, item.voice_duration_sec || 0), {
    keyboard: C.analysisReportKeyboard(locale, item.id),
  });
}

async function runAnalysis(
  deps: Deps,
  chatId: number,
  userId: number,
  locale: Locale,
  pseudo: string,
  item: S.TgItemRow,
): Promise<void> {
  const { db, cfg, tg, env } = deps;
  if (item.source_type !== 'voice') {
    await tg.sendMessage(chatId, C.ERR_STALE[locale]);
    return;
  }

  const cached = await S.getOwnedAnalysis(db, item.id, userId);
  if (cached) return await sendStoredAnalysis(deps, chatId, locale, pseudo, item, cached, true);

  const duration = Math.max(0, Number(item.voice_duration_sec) || 0);
  if (duration < 10) {
    await S.logEvent(db, 'analysis_abstained', pseudo, { locale, reason: 'too_short', durationBucket: durationBucket(duration) });
    await tg.sendMessage(chatId, C.ANALYSIS_TOO_SHORT[locale]);
    return;
  }

  const quota = await decideAnalysisUsage(db, userId, cfg.analysisFreeDaily);
  if (!quota.allowed) {
    await S.logEvent(db, 'analysis_limit_reached', pseudo, { locale, limit: cfg.analysisFreeDaily });
    await tg.sendMessage(chatId, C.ANALYSIS_LIMIT[locale]);
    return;
  }

  const progress = await tg.sendMessage(chatId, C.analysisProcessing(locale, duration));
  const progressMessageId = progress.result?.message_id;
  await tg.sendChatAction(chatId);
  const segments = parseStoredSegments(item.transcript_segments_json);
  const language: 'ru' | 'uz' | 'other' = item.source_language === 'ru' || item.source_language === 'uz'
    ? item.source_language
    : 'other';
  const result = await analyzeTranscript(env, item.source_text!, language, segments, cfg.analysisTimeoutMs);
  if (progressMessageId) await tg.deleteMessage(chatId, progressMessageId);

  if (!result.ok || !result.analysis) {
    const abstained = result.errorCode === 'insufficient_content';
    await S.logEvent(db, abstained ? 'analysis_abstained' : 'analysis_failed', pseudo, {
      locale,
      code: result.errorCode || 'unknown',
      provider: result.provider,
      latencyBucket: latencyBucket(result.latencyMs),
      durationBucket: durationBucket(duration),
    });
    await tg.sendMessage(chatId, abstained ? C.ANALYSIS_INSUFFICIENT[locale] : C.ANALYSIS_FAILED[locale]);
    return;
  }

  const analysis: TranscriptAnalysis = result.analysis;
  const saved = await S.saveAnalysis(db, {
    telegram_user_id: userId,
    item_id: item.id,
    language,
    summary: analysis.summary,
    transcript_with_timestamps: timestampedTranscript(segments),
    claims_json: JSON.stringify(analysis.claims),
    contradictions_json: JSON.stringify(analysis.contradictions),
    hedging_json: JSON.stringify(analysis.hedging),
    questions_json: JSON.stringify(analysis.questions),
    quality_assessment: segments.length ? 'timestamped_transcript' : 'transcript_only',
    provider: result.provider,
    model: result.model || null,
    prompt_version: result.promptVersion,
    latency_ms: result.latencyMs,
  }, cfg.analysisTtlMs, item.expires_at);

  if (saved.created) {
    await consumeUsage(db, userId, 'analysis', `analysis:${saved.id}`, { itemId: item.id, resultId: saved.id });
  }
  await S.logEvent(db, saved.created ? 'analysis_completed' : 'analysis_race_cached', pseudo, {
    locale,
    provider: result.provider,
    model: result.model || '',
    promptVersion: result.promptVersion,
    latencyBucket: latencyBucket(result.latencyMs),
    durationBucket: durationBucket(duration),
    claimCount: analysis.claims.length,
    contradictionCount: analysis.contradictions.length,
    hedgingCount: analysis.hedging.length,
    questionCount: analysis.questions.length,
  });
  await sendStoredAnalysis(deps, chatId, locale, pseudo, item, saved.row, false);
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
    keyboard: item.source_type === 'voice'
      ? C.voiceResultKeyboard(locale, item.id, outLang === 'uz' ? 'uz' : outLang === 'ru' ? 'ru' : 'other')
      : C.resultKeyboard(locale, item.id, outLang === 'uz' ? 'uz' : outLang === 'ru' ? 'ru' : 'other', !!cfg.botUsername && total > 0 && total % SHARE_EVERY === 0),
  });
}
