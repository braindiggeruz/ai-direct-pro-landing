import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ContactCandidates } from '../components/lead-radar/ContactCandidates';
import { WebsiteCollectorCard } from '../components/lead-radar/WebsiteCollectorCard';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  AtSign,
  Bot,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  Database,
  ExternalLink,
  FileCheck2,
  Filter,
  Globe2,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Phone,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  UserRoundCheck,
} from 'lucide-react';
import { api } from '../lib/api';
import { requestFailureHint } from '../lib/request-recovery';
import { Badge, Button, Input, Label, Select, Textarea } from '../components/ui';
import { TelegramBusinessConnectionCard } from '../components/lead-radar/TelegramBusinessConnectionCard';
import { TelegramAccountCampaignPanel } from '../components/lead-radar/TelegramAccountCampaignPanel';
import { TelegramContactDirectory } from '../components/lead-radar/TelegramContactDirectory';
import { OutreachExport } from '../components/lead-radar/OutreachExport';
import { FirecrawlDiagnostics } from '../components/lead-radar/FirecrawlDiagnostics';
import {
  boundTelegramDraftText,
  isVerifiedCorporateBusinessEndpoint,
  isTelegramDraftTextReady,
  TelegramOutreachActions,
  type TelegramSendResult,
} from '../components/lead-radar/TelegramOutreachActions';
import type {
  LeadRadarLead,
  LeadRadarDecisionMaker,
  LeadRadarEnrichmentReason,
  LeadRadarEnrichmentStatus,
  LeadRadarLifecycle,
  LeadRadarOverview,
  LeadRadarPriority,
  LeadRadarSearchInput,
  LeadRadarSearchPhase,
  LeadRadarSearchResult,
  LeadRadarSearchSummary,
  LeadRadarTelegramBusinessConnectLink,
  LeadRadarTelegramBusinessStatus,
  LeadRadarTelegramContact,
  LeadRadarTelegramOutreachEndpoint,
  LeadRadarTelegramOutreachPreparation,
} from '../../shared/lead-radar';
import {
  LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_DAILY_LIMIT,
  LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_MIN_INTERVAL_SECONDS,
} from '../../shared/lead-radar-telegram-campaign-policy';
import {
  leadRadarPrefillFromHandoff,
  parseSignalHandoff,
  type SignalHandoff,
} from '../../shared/signal-handoff';

const DEFAULT_INPUT: LeadRadarSearchInput = {
  niche: 'Стоматологии',
  city: 'Ташкент',
  country: 'UZ',
  offer: 'AI-бот для обработки заявок в Telegram и Instagram',
  desiredCount: 20,
  searchGoal: 'telegram_contacts',
  maxCandidates: 100,
  telegramRequired: true,
  languages: ['ru', 'uz'],
};

type SearchAttemptError = {
  input: LeadRadarSearchInput;
  message: string;
};

function cloneSearchInput(input: LeadRadarSearchInput): LeadRadarSearchInput {
  return { ...input, languages: [...input.languages] };
}

function normalizedSearchText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
}

function sameSearchInput(left: LeadRadarSearchInput, right: LeadRadarSearchInput): boolean {
  return normalizedSearchText(left.niche) === normalizedSearchText(right.niche)
    && normalizedSearchText(left.city) === normalizedSearchText(right.city)
    && normalizedSearchText(left.country) === normalizedSearchText(right.country)
    && normalizedSearchText(left.offer) === normalizedSearchText(right.offer)
    && left.desiredCount === right.desiredCount
    && (left.searchGoal ?? 'companies') === (right.searchGoal ?? 'companies')
    && left.maxCandidates === right.maxCandidates
    && left.telegramRequired === right.telegramRequired
    && [...left.languages].sort().join('|') === [...right.languages].sort().join('|');
}

function searchInputLabel(input: LeadRadarSearchInput): string {
  return `${input.niche.trim()} · ${input.city.trim()}`;
}

const LIFECYCLE_LABELS: Record<LeadRadarLifecycle, string> = {
  new: 'Новый',
  contacted: 'Связались',
  replied: 'Ответил',
  qualified: 'Квалифицирован',
  meeting: 'Встреча',
  won: 'Сделка',
  lost: 'Не подходит',
  do_not_contact: 'Не связываться',
};

const PRIORITY_COPY: Record<LeadRadarPriority, { title: string; body: string; tone: 'success' | 'info' | 'neutral' }> = {
  P1: { title: 'Активный сигнал', body: 'Обнаружен публичный intent-сигнал и сильные доказательства. Это не вероятность сделки.', tone: 'success' },
  P2: { title: 'Вероятная потребность', body: 'Компания подходит, но прямой запрос ещё не подтверждён.', tone: 'info' },
  P3: { title: 'Соответствует ICP', body: 'Нужно больше фактов перед первым контактом.', tone: 'neutral' },
};

const STATUS_COPY: Record<LeadRadarSearchSummary['status'], { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  running: { label: 'Выполняется', tone: 'neutral' },
  ready: { label: 'Готово', tone: 'success' },
  partial: { label: 'Частичный результат', tone: 'warning' },
  failed: { label: 'Не завершён', tone: 'danger' },
  insufficient_results: { label: 'Мало данных', tone: 'warning' },
};

const FAILURE_COPY: Record<string, { title: string; body: string }> = {
  city_not_found: {
    title: 'Не удалось определить город',
    body: 'Уточните название города и повторите поиск. Компании ещё не проверялись.',
  },
  geocoder_unavailable: {
    title: 'География временно недоступна',
    body: 'Сервис определения города не ответил. Поля поиска сохранены — попробуйте снова через минуту.',
  },
  discovery_source_unavailable: {
    title: 'Источник компаний временно недоступен',
    body: 'Список компаний получить не удалось. Это не означает, что компаний нет; запрос можно безопасно повторить.',
  },
  source_timeout: {
    title: 'Источник не успел ответить',
    body: 'Ожидание превысило безопасный лимит. Запрос сохранён и готов к повтору.',
  },
  upstream_payload_invalid: {
    title: 'Источник вернул некорректные данные',
    body: 'Мы отклонили непроверяемый ответ и не добавили сомнительные компании. Попробуйте ещё раз.',
  },
  search_interrupted: {
    title: 'Предыдущий запуск прервался',
    body: 'Соединение завершилось до сохранения результата. Параметры не потеряны — поиск можно безопасно повторить.',
  },
  discovery_failed: {
    title: 'Поиск не завершён',
    body: 'Компании не проверялись из-за технического сбоя. Попробуйте повторить запрос.',
  },
};

type LeadFilter = 'all' | 'decision_maker' | 'personal_telegram' | 'P1';

const CONTACT_TYPE_COPY: Record<LeadRadarTelegramContact['type'], { label: string; tone: 'success' | 'info' | 'warning' | 'danger' | 'neutral' }> = {
  human: { label: 'Личный Telegram', tone: 'success' },
  bot: { label: 'Бот · не ЛПР', tone: 'danger' },
  channel: { label: 'Канал · не ЛПР', tone: 'warning' },
  group: { label: 'Группа · не ЛПР', tone: 'warning' },
  business: { label: 'Корпоративный аккаунт', tone: 'info' },
  unknown: { label: 'Тип не подтверждён', tone: 'neutral' },
};

const PHASE_COPY: Record<LeadRadarSearchPhase, { title: string; detail: string }> = {
  queued: { title: 'Поиск поставлен в очередь', detail: 'Подготавливаем запрос и открытые источники.' },
  discovering: { title: 'Ищем компании', detail: 'Собираем и удаляем дубли из публичного списка кандидатов.' },
  enriching: { title: 'Проверяем компании и контакты', detail: 'Карточки появляются сразу после проверки; поиск представителей продолжается.' },
  finalizing: { title: 'Завершаем проверку', detail: 'Фиксируем доказательства и итоговые счётчики.' },
  completed: { title: 'Проверка завершена', detail: 'Результаты и источники сохранены.' },
};

const ENRICHMENT_STATUS_COPY: Record<LeadRadarEnrichmentStatus, { label: string; tone: 'info' | 'warning' | 'neutral' | 'success' }> = {
  pending: { label: 'Ожидает проверки', tone: 'neutral' },
  queued: { label: 'В очереди', tone: 'neutral' },
  processing: { label: 'Проверяем источники', tone: 'info' },
  enriched: { label: 'Источники проверены', tone: 'success' },
  terminal: { label: 'Проверка завершена', tone: 'neutral' },
};

const ENRICHMENT_REASON_COPY: Record<LeadRadarEnrichmentReason, string> = {
  no_website: 'Сайт не указан или недоступен — сохранены базовые данные из публичной записи.',
  enriched: 'Публичные страницы компании проверены.',
  no_relevant_evidence: 'На доступных страницах не найдено релевантных контактных доказательств.',
  robots_blocked: 'Сайт ограничил автоматическую проверку; найденные данные сохранены.',
  http_blocked: 'Сайт не разрешил получить страницу; найденные данные сохранены.',
  source_timeout: 'Источник не успел ответить; найденные данные сохранены. Проверка повторится сама: через ~15 минут, затем через 1 и 4 часа.',
  source_unavailable: 'Источник временно недоступен; найденные данные сохранены. Проверка повторится сама: через ~15 минут, затем через 1 и 4 часа.',
  invalid_website: 'Адрес сайта не удалось безопасно проверить.',
  payload_invalid: 'Источник вернул данные, которые нельзя было надёжно подтвердить.',
  retry_exhausted: 'Лимит безопасных повторов исчерпан; можно повторить поиск позже.',
  suppressed: 'Компания исключена из контактных действий.',
};

const SOURCE_CLAIM_COPY: Record<LeadRadarDecisionMaker['sourceClaim'], string> = {
  official_site_proximity: 'Имя, роль и Telegram опубликованы рядом на странице сайта, указанного в публичной записи компании. Это ещё не подтверждение личности.',
  json_ld_same_as: 'Telegram указан в структурированных данных страницы сайта из публичной записи компании. Профиль всё равно требует ручной проверки.',
};

const REVIEW_STATUS_COPY: Record<LeadRadarDecisionMaker['contactReviewStatus'], { label: string; tone: 'success' | 'danger' | 'warning' }> = {
  unreviewed: { label: 'Требует ручной проверки', tone: 'warning' },
  approved: { label: 'Проверен владельцем', tone: 'success' },
  rejected: { label: 'Контакт отклонён', tone: 'danger' },
};

function contactConfidence(value: number): number {
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function decisionMakersFor(lead: LeadRadarLead): LeadRadarDecisionMaker[] {
  return lead.decisionMakers ?? [];
}

function companyTelegramFor(lead: LeadRadarLead): LeadRadarTelegramContact | null {
  const explicit = lead.telegramContact;
  if (explicit) return explicit;
  if (!lead.telegramUrl) return null;
  return {
    url: lead.telegramUrl,
    username: '',
    type: 'unknown',
    confidence: 0,
    reason: 'Тип аккаунта ещё не подтверждён отдельным доказательством.',
    evidenceIds: [],
    verifiedAt: lead.lastVerifiedAt,
    messageable: false,
  };
}

function isPublishedDecisionMaker(person: LeadRadarDecisionMaker): boolean {
  return Boolean(
    person.name.trim()
    && person.role.trim()
    && person.sourceUrl
    && person.evidence
    && person.verifiedAt
    && person.evidenceIds.length > 0
    && person.sourceClaim,
  );
}

function isPersonalTelegram(person: LeadRadarDecisionMaker): boolean {
  return person.contactType === 'human' && Boolean(person.telegramUrl);
}

function normalizedTelegramLocator(value: string | null): string {
  if (!value) return '';
  return value.trim().replace(/^https?:\/\/(?:www\.)?t\.me\//i, '').replace(/^@/, '').replace(/\/$/, '').toLowerCase();
}

function isMessageableDecisionMaker(lead: LeadRadarLead, person: LeadRadarDecisionMaker): boolean {
  if (!isPublishedDecisionMaker(person) || !isPersonalTelegram(person) || person.contactReviewStatus !== 'approved') return false;
  const contact = companyTelegramFor(lead);
  if (!contact || contact.type !== 'human' || !contact.messageable) return false;
  const contactLocator = normalizedTelegramLocator(contact.username || contact.url);
  const personLocator = normalizedTelegramLocator(person.telegramUsername || person.telegramUrl);
  return Boolean(contactLocator && personLocator && contactLocator === personLocator);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(parsed);
}

export function leadRadarSearchRateLimitCopy(retryAfterSeconds?: number): string {
  const retry = retryAfterSeconds
    ? ` Повтор можно сделать примерно через ${retryAfterSeconds} сек.`
    : '';
  return `Новый поиск пока не принят сервером: действует ограничение частоты или ещё есть незавершённые запуски. Текущий результат не потерян.${retry}`;
}

export function leadRadarSearchPulseNotice(result: {
  note: string;
  kicked: number;
  remaining: number | null;
}): string {
  const remaining = result.remaining === null
    ? 'остаток пула уточняется'
    : `в пуле осталось: ${result.remaining}`;
  return `${result.note} Отправлено в очередь: ${result.kicked}; ${remaining}.`;
}

export function leadRadarPulseSettlement(input: {
  currentOperation: number;
  operation: number;
  currentView: number;
  view: number;
}): { ownsOperation: boolean; mayPublish: boolean } {
  const ownsOperation = input.currentOperation === input.operation;
  return {
    ownsOperation,
    mayPublish: ownsOperation && input.currentView === input.view,
  };
}

function errorCopy(error: unknown): string {
  const details = error as Error & { code?: string; retryAfterSeconds?: number };
  const code = details?.code;
  if (code === 'search_rate_limited') {
    return leadRadarSearchRateLimitCopy(details.retryAfterSeconds);
  }
  if (code === 'payload_too_large' || code === 'invalid_search') return 'Проверьте заполненные поля и повторите попытку.';
  if (code === 'lead_radar_admission_paused') return 'Новые поиски временно приостановлены защитным переключателем. Сохранённые исследования остаются доступны.';
  if (code === 'lead_radar_contact_paused') return 'Контактные действия отключены. Доступны только исследование компании и установка запрета на обращение.';
  if (code === 'lead_radar_schema_unavailable') return 'Lead Radar безопасно приостановлен: версия базы данных не соответствует проверенному контракту.';
  if (code === 'lead_radar_request_key_conflict') return 'Повтор запроса не совпал с исходными параметрами. Проверьте форму и запустите новый поиск.';
  if (code === 'lead_radar_request_key_invalid' || code === 'lead_radar_idempotency_key_required') return 'Не удалось создать безопасный ключ запроса. Обновите страницу и повторите поиск.';
  if (code === 'telegram_business_not_configured') return 'Выделенный Telegram Business бот ещё не настроен. Обратитесь к администратору платформы.';
  if (code === 'telegram_business_nonce_expired_or_used') return 'Ссылка подключения истекла или уже использована. Нажмите «Повторить подключение», чтобы получить новую безопасную ссылку.';
  if (code === 'telegram_business_paused') return 'Отправка через Telegram Business временно приостановлена. Используйте только ручной черновик.';
  if (code === 'telegram_business_chat_inactive') return '24-часовое окно активного чата завершилось. Откройте ручной черновик и отправьте сообщение самостоятельно.';
  if (code === 'telegram_business_reply_not_allowed' || code === 'telegram_business_connection_disabled') return 'Подключение Telegram больше не разрешает ответы. Обновите статус или подключите аккаунт заново.';
  if (code === 'telegram_business_company_unmatched' || code === 'telegram_business_company_ambiguous') return 'Telegram endpoint компании не прошёл точное серверное сопоставление. Автоматическая отправка закрыта.';
  if (code === 'telegram_business_approval_required') return 'Подтверждение отправки устарело. Ещё раз проверьте адресата и текст.';
  if (code === 'telegram_business_idempotency_conflict') return 'Безопасный ключ уже связан с другим сообщением. Обновите карточку перед новой отправкой.';
  if (code === 'telegram_business_rate_limited') return 'Достигнут безопасный лимит Telegram Business. Отложите отправку или используйте ручной черновик.';
  if (code === 'telegram_business_send_in_flight') return 'Этот запрос уже обрабатывается. Не создавайте повторную отправку; сначала проверьте чат.';
  if (code === 'telegram_business_send_ambiguous') return 'Telegram не подтвердил итог отправки. Автоматическая повторная попытка отключена — проверьте чат вручную.';
  if (code === 'telegram_business_send_canceled') return 'Предыдущая отправка была отменена до обращения к Telegram. Ещё раз проверьте текст и подтвердите новую попытку.';
  if (code === 'telegram_business_org_not_allowed') return 'Telegram Business не разрешён для этой организации. Контактные действия остаются закрытыми.';
  if (code === 'telegram_business_provider_failed') return 'Telegram отклонил отправку. Проверьте подключение и используйте ручной черновик.';
  if (code === 'UNAUTHENTICATED') return 'Сессия завершилась. Войдите в панель снова.';
  return 'Операция не завершилась. Повторите попытку; если ошибка вернётся, сообщите время запуска.';
}

function leadMessage(lead: LeadRadarLead, offer: string, person: LeadRadarDecisionMaker): string {
  const factSignal = lead.signals.find((signal) => signal.classification === 'fact' && signal.type !== 'active_website');
  const evidenceLine = factSignal
    ? `В открытых материалах вашей компании увидел сигнал «${factSignal.label}».`
    : `Посмотрел открытые материалы компании «${lead.name}».`;
  return [
    `Здравствуйте, ${person.name}!`,
    evidenceLine,
    `Мы внедряем ${offer.toLocaleLowerCase('ru-RU')} и помогаем не терять обращения вне рабочего времени.`,
    'Могу бесплатно показать короткий сценарий именно под вашу нишу — без обязательств. Актуально обсудить?',
  ].join('\n\n');
}

type CorporateDraftLanguage = 'ru' | 'uz';

function companyMessage(
  lead: LeadRadarLead,
  offer: string,
  language: CorporateDraftLanguage,
): string {
  if (language === 'uz') {
    return [
      `Assalomu alaykum, «${lead.name}» jamoasi!`,
      'Kompaniyangizning ochiq ma’lumotlarini ko‘rib chiqdim.',
      `Biz ${offer} yechimini joriy qilamiz va ish vaqtidan tashqari murojaatlarni yo‘qotmaslikka yordam beramiz.`,
      'Sohangiz uchun qisqa ssenariyni bepul ko‘rsatishim mumkin. Bu masalani kim bilan muhokama qilish mumkin?',
    ].join('\n\n');
  }
  const factSignal = lead.signals.find((signal) => signal.classification === 'fact' && signal.type !== 'active_website');
  const evidenceLine = factSignal
    ? `В открытых материалах компании увидел сигнал «${factSignal.label}».`
    : `Посмотрел открытые материалы компании «${lead.name}».`;
  return [
    `Здравствуйте, команда «${lead.name}»!`,
    evidenceLine,
    `Мы внедряем ${offer.toLocaleLowerCase('ru-RU')} и помогаем не терять обращения вне рабочего времени.`,
    'Могу бесплатно показать короткий сценарий под вашу нишу — без обязательств. Подскажите, с кем можно обсудить?',
  ].join('\n\n');
}

function campaignMessageTemplate(offer: string): string {
  return boundTelegramDraftText([
    'Здравствуйте!',
    'Посмотрел открытые материалы компании «{company_name}».',
    `Мы внедряем ${offer.toLocaleLowerCase('ru-RU')} и помогаем не терять обращения вне рабочего времени.`,
    'Могу бесплатно показать короткий сценарий именно под вашу нишу — без обязательств. Актуально обсудить?',
    'Если сообщение неактуально, напишите «стоп», и мы больше не будем обращаться.',
  ].join('\n\n'));
}

function telegramDiscoveryPriority(lead: LeadRadarLead): number {
  const contact = companyTelegramFor(lead);
  if (contact?.type === 'business' && contact.evidenceIds.length > 0 && contact.verifiedAt) return 3;
  if (decisionMakersFor(lead).some((person) => Boolean(person.telegramUrl))) return 2;
  if (contact || lead.telegramUrl) return 1;
  return 0;
}

function isLocallyVerifiedCorporateBusinessContact(
  contact: LeadRadarTelegramContact | null,
  now = Date.now(),
): contact is LeadRadarTelegramContact {
  if (!contact
    || contact.type !== 'business'
    || !/^[A-Za-z0-9_]{5,32}$/u.test(contact.username)
    || contact.confidence < 0.8
    || contact.evidenceIds.length === 0) return false;
  const verifiedAt = Date.parse(contact.verifiedAt);
  if (!Number.isFinite(verifiedAt)
    || verifiedAt > now + 5 * 60_000
    || now - verifiedAt > 30 * 24 * 60 * 60_000) return false;
  try {
    const endpoint = new URL(contact.url);
    const parts = endpoint.pathname.split('/').filter(Boolean);
    return endpoint.protocol === 'https:'
      && (endpoint.hostname.toLowerCase() === 't.me' || endpoint.hostname.toLowerCase() === 'telegram.me')
      && parts.length === 1
      && parts[0]?.toLowerCase() === contact.username.toLowerCase();
  } catch {
    return false;
  }
}

function normalizeTelegramBusinessConnectUrl(value: string): string | null {
  if (!value || value.trim() !== value || value.length > 2_048) return null;
  try {
    const endpoint = new URL(value);
    const parts = endpoint.pathname.split('/').filter(Boolean);
    const start = endpoint.searchParams.get('start');
    if (endpoint.protocol !== 'https:'
      || (endpoint.hostname.toLowerCase() !== 't.me' && endpoint.hostname.toLowerCase() !== 'telegram.me')
      || endpoint.username
      || endpoint.password
      || parts.length !== 1
      || !/^[A-Za-z0-9_]{5,32}$/u.test(parts[0] ?? '')
      || !start
      || !/^lr_[A-Fa-f0-9]{16}_[A-Za-z0-9_-]{20,80}$/u.test(start)
      || [...endpoint.searchParams.keys()].some((key) => key !== 'start')) return null;
    return endpoint.toString();
  } catch {
    return null;
  }
}

function telegramEndpointFor(
  contact: LeadRadarTelegramContact | null,
  suppressed: boolean,
): LeadRadarTelegramOutreachEndpoint {
  const kind = contact?.type ?? 'unknown';
  return {
    kind,
    verification: isLocallyVerifiedCorporateBusinessContact(contact) ? 'verified' : 'unverified',
    ownership: kind === 'business' ? 'corporate' : kind === 'human' ? 'personal' : 'unknown',
    doNotContact: suppressed,
  };
}

function isAmbiguousTelegramSendError(error: unknown): boolean {
  const details = error as { code?: unknown; status?: unknown } | null;
  return details?.code === 'telegram_business_send_ambiguous'
    || details?.code === 'telegram_business_send_in_flight'
    || typeof details?.status !== 'number';
}

const TELEGRAM_AMBIGUOUS_LOCK_PREFIX = 'gptbot:lead-radar:telegram-ambiguous:';

function telegramAutomaticSendLockKey(leadId: string): string {
  return `${TELEGRAM_AMBIGUOUS_LOCK_PREFIX}${leadId}`;
}

function hasTelegramAutomaticSendLock(leadId: string): boolean {
  try {
    return typeof window !== 'undefined'
      && window.sessionStorage.getItem(telegramAutomaticSendLockKey(leadId)) === '1';
  } catch {
    // Storage may be unavailable in hardened/private browser contexts. The
    // in-memory lock below still keeps this mounted card fail-closed.
    return false;
  }
}

function persistTelegramAutomaticSendLock(leadId: string): void {
  try {
    window.sessionStorage.setItem(telegramAutomaticSendLockKey(leadId), '1');
  } catch {
    // The in-memory state remains locked even when storage is unavailable.
  }
}

async function loadVerifiedCorporateTelegramPreparation(
  leadId: string,
  text: string,
): Promise<LeadRadarTelegramOutreachPreparation> {
  const next = await api.leadRadarPrepareTelegramOutreach(leadId, text);
  if (!isVerifiedCorporateBusinessEndpoint(next.endpoint) || !next.manualDraftUrl) {
    throw Object.assign(new Error('Corporate Telegram endpoint is not verified'), {
      code: 'telegram_business_company_unmatched',
    });
  }
  return next;
}

function ScoreRing({ value }: { value: number }) {
  return (
    <div
      className="grid h-16 w-16 shrink-0 place-items-center rounded-full p-[5px]"
      style={{ background: `conic-gradient(#2fe6d1 ${value * 3.6}deg, rgba(255,255,255,.08) 0deg)` }}
      role="img"
      aria-label={`Оценка ${value} из 100`}
    >
      <div className="grid h-full w-full place-items-center rounded-full bg-[#08111f] text-sm font-semibold text-white">
        {value}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, accent = false }: {
  icon: typeof Radar;
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="flex items-center gap-2 text-xs text-white/65">
        <Icon size={14} className={accent ? 'text-brand-cyan' : 'text-white/40'} aria-hidden="true" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-white tabular-nums">{value}</div>
    </div>
  );
}

function SearchHistory({ searches, activeId, disabled = false, onOpen }: {
  searches: LeadRadarSearchSummary[];
  activeId?: string;
  disabled?: boolean;
  onOpen: (id: string) => void;
}) {
  if (searches.length === 0) return null;
  return (
    <section aria-labelledby="history-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">История</p>
          <h2 id="history-title" className="mt-1 text-base font-semibold text-white">Последние запуски</h2>
        </div>
      </div>
      <div className="grid gap-2">
        {searches.slice(0, 5).map((search) => (
          <button
            key={search.id}
            type="button"
            onClick={() => onOpen(search.id)}
            disabled={disabled}
            aria-current={activeId === search.id ? 'true' : undefined}
            className={`group min-h-16 rounded-2xl border px-4 py-3 text-left transition-colors disabled:cursor-wait disabled:opacity-50 ${
              activeId === search.id
                ? 'border-brand-cyan/35 bg-brand-cyan/[0.08]'
                : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white">{search.input.niche}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-white/60">
                  <span>{search.input.city}</span><span aria-hidden="true">·</span><span>{formatDate(search.createdAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_COPY[search.status].tone}>{STATUS_COPY[search.status].label}</Badge>
                <span className="text-xs tabular-nums text-white/55" aria-label={`${search.funnel.processedCount} обработано из ${search.funnel.candidateCount} сохранённых компаний`}>карточки {search.funnel.processedCount}/{search.funnel.candidateCount}</span>
                <ChevronRight size={15} className="text-white/25 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function SearchOutcome({
  title,
  body,
  detail,
  danger = false,
  primary,
  secondary,
}: {
  title: string;
  body: string;
  detail?: string;
  danger?: boolean;
  primary?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <section
      role={danger ? 'alert' : 'status'}
      className={`grid min-h-64 place-items-center rounded-[1.75rem] border p-6 text-center ${
        danger ? 'border-rose-400/20 bg-rose-400/[0.045]' : 'border-white/[0.09] bg-[#08111f]/65'
      }`}
    >
      <div className="max-w-xl">
        <div className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl border ${
          danger ? 'border-rose-300/25 bg-rose-400/[0.08] text-rose-200' : 'border-brand-cyan/20 bg-brand-cyan/[0.07] text-brand-cyan'
        }`}>
          {danger ? <AlertTriangle size={24} aria-hidden="true" /> : <Radar size={24} aria-hidden="true" />}
        </div>
        <h2 className="mt-5 text-xl font-semibold text-white">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/65">{body}</p>
        {detail && <p className="mt-2 text-xs text-white/50">{detail}</p>}
        {(primary || secondary) && (
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            {primary && <Button type="button" size="lg" onClick={primary.onClick} className="min-h-12">{primary.label}</Button>}
            {secondary && <Button type="button" size="lg" variant="secondary" onClick={secondary.onClick} className="min-h-12">{secondary.label}</Button>}
          </div>
        )}
      </div>
    </section>
  );
}

export function leadRadarLateStageValue(value: number, running: boolean): string | number {
  return running && value === 0 ? 'Пока 0' : value;
}

export function leadRadarSavedCardsProgress(
  funnel: Pick<LeadRadarSearchSummary['funnel'], 'candidateCount' | 'processedCount'>,
): { label: string; value: number; max: number } {
  const max = Math.max(funnel.candidateCount, funnel.processedCount);
  return {
    label: 'Обработанные сохранённые карточки',
    value: Math.min(funnel.processedCount, max),
    max,
  };
}

function CurrentSearchFunnel({ search, pollingDelayed, pollingStopped }: {
  search: LeadRadarSearchSummary;
  pollingDelayed: boolean;
  pollingStopped: boolean;
}) {
  const phase = PHASE_COPY[search.phase ?? (search.status === 'running' ? 'discovering' : 'completed')];
  const funnel = search.funnel ?? {
    rawDiscoveredCount: search.candidateCount,
    candidateCount: search.candidateCount,
    processedCount: search.verifiedCount,
    pendingCount: Math.max(0, search.candidateCount - search.verifiedCount),
    websiteCount: 0,
    enrichedCount: search.verifiedCount,
    decisionMakerCount: 0,
    companyTelegramCount: 0,
    personalTelegramCount: search.telegramCount,
    excludedCount: 0,
  };
  const running = search.status === 'running';
  const savedCardsProgress = leadRadarSavedCardsProgress(funnel);
  const progressMax = savedCardsProgress.max;
  const progressValue = savedCardsProgress.value;
  const metrics = [
    ['Найдено', funnel.rawDiscoveredCount],
    ['Сохранено компаний', funnel.candidateCount],
    ['Обработано', funnel.processedCount],
    ['Подтверждено фактами', search.verifiedCount],
    ['Представителей в источниках', leadRadarLateStageValue(funnel.decisionMakerCount, running)],
    ['Личный Telegram одобрен', leadRadarLateStageValue(funnel.personalTelegramCount, running)],
  ] as const;

  return (
    <section aria-labelledby="current-search-progress" aria-busy={running} className="rounded-[1.5rem] border border-white/[0.08] bg-[#08111f]/75 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {running && <LoaderCircle size={16} className="shrink-0 text-brand-cyan motion-safe:animate-spin" aria-hidden="true" />}
            <h3 id="current-search-progress" className="text-sm font-semibold text-white">{phase.title}</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-white/60">{
            pollingStopped
              ? 'Автообновление остановлено после 15 минут. Найденные данные сохранены; обновите статус вручную.'
              : pollingDelayed
                ? 'Обновление задерживается — найденные данные сохранены, повторяем соединение автоматически.'
                : phase.detail
          }</p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-white/60">цель: {search.input.desiredCount}</span>
      </div>

      {running && progressMax > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-white/60">
            <span>{savedCardsProgress.label}</span>
            <span className="shrink-0 tabular-nums">{progressValue}/{progressMax}</span>
          </div>
          <div
            role="progressbar"
            aria-label={savedCardsProgress.label}
            aria-valuemin={0}
            aria-valuemax={progressMax}
            aria-valuenow={progressValue}
            aria-valuetext={`Обработано ${progressValue} из ${progressMax}`}
            className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
          >
            <div className="h-full rounded-full bg-gradient-to-r from-brand-blue to-brand-cyan transition-[width] motion-reduce:transition-none" style={{ width: `${progressMax > 0 ? Math.round(progressValue / progressMax * 100) : 0}%` }} />
          </div>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6">
        {metrics.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.022] px-3 py-3">
            <dt className="text-[10px] leading-4 text-white/55">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-white">{value}</dd>
          </div>
        ))}
      </dl>

      {search.input.searchGoal === 'telegram_contacts' && <p className="mt-3 text-xs leading-5 text-white/70">
        Цель подтверждённых Telegram-контактов: {search.funnel.resolvedTelegramCount ?? 0} из {search.input.desiredCount}. В источниках найдено: {funnel.companyTelegramCount}.
        Обработка сохранённых карточек сама по себе не означает, что Telegram-цель достигнута.
        Проверяем до {search.input.maxCandidates ?? 250} компаний в этом городе, не более часа и в пределах бюджета источников.
        Bridge проверяет контакты в фоне, без сообщений. Готовность к отправке проверяется отдельно. При исчерпании источников сохраняется частичный результат.
      </p>}

      {(search.warnings?.length ?? 0) > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.045] p-3 text-xs leading-5 text-amber-100/85">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Часть источников ответила с ограничениями. Найденные компании и доказательства сохранены.
        </p>
      )}
      <p className="sr-only" aria-live="polite">{
        pollingStopped
          ? 'Автоматическое обновление остановлено. Обновите статус вручную.'
          : pollingDelayed
            ? 'Обновление задерживается, повторяем соединение автоматически.'
            : phase.title
      }</p>
    </section>
  );
}

function LeadListItem({ lead, selected, onSelect }: {
  lead: LeadRadarLead;
  selected: boolean;
  onSelect: () => void;
}) {
  const priority = PRIORITY_COPY[lead.priority];
  const decisionMakers = decisionMakersFor(lead);
  const publishedDecisionMakers = decisionMakers.filter(isPublishedDecisionMaker);
  const personalTelegram = decisionMakers.some((person) => isMessageableDecisionMaker(lead, person));
  const companyTelegram = companyTelegramFor(lead);
  const enrichment = ENRICHMENT_STATUS_COPY[lead.enrichmentStatus ?? 'terminal'];
  return (
    <button
      id={`lead-list-${lead.id}`}
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan ${
        selected
          ? 'border-brand-cyan/35 bg-brand-cyan/[0.07] shadow-[0_18px_55px_-35px_rgba(47,230,209,.75)]'
          : 'border-white/[0.07] bg-white/[0.018] hover:border-white/15 hover:bg-white/[0.04]'
      }`}
      aria-pressed={selected}
    >
      <div className="flex items-start gap-3">
        <ScoreRing value={lead.score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={priority.tone}>{lead.priority}</Badge>
            {publishedDecisionMakers.length > 0 && <Badge tone="info">Представитель: {publishedDecisionMakers.length}</Badge>}
            {personalTelegram && <Badge tone="success">Сопоставление одобрено</Badge>}
            {companyTelegram?.type === 'bot' && <Badge tone="danger"><span className="inline-flex items-center gap-1"><Bot size={12} aria-hidden="true" />Бот</span></Badge>}
            {lead.lifecycle !== 'new' && <Badge tone="neutral">{LIFECYCLE_LABELS[lead.lifecycle]}</Badge>}
          </div>
          <h3 className="mt-2 truncate text-base font-semibold text-white">{lead.name}</h3>
          <p className="mt-1 truncate text-xs text-white/65">{lead.category} · {lead.city}</p>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-white/60">
            <FileCheck2 size={13} className="text-brand-cyan" aria-hidden="true" />
            {lead.evidence.length} доказательств
            <span aria-hidden="true">·</span>
            достоверность {Math.round(lead.confidence * 100)}%
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/60">
            <Badge tone={enrichment.tone}>{enrichment.label}</Badge>
            {lead.enrichmentReason && <span>{ENRICHMENT_REASON_COPY[lead.enrichmentReason]}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

function LeadDetail({ lead, offer, contactEnabled, onLifecycle, onReviewContact, busy, reviewBusyId, onBack, focusOnMount, canCheckContacts, onContactResolved, onWebsiteContactsUpdated }: {
  lead: LeadRadarLead;
  offer: string;
  contactEnabled: boolean;
  canCheckContacts: boolean;
  onContactResolved: () => void;
  onWebsiteContactsUpdated: () => Promise<void>;
  onLifecycle: (lifecycle: LeadRadarLifecycle) => void;
  onReviewContact: (personId: string, status: 'approved' | 'rejected') => void;
  busy: boolean;
  reviewBusyId: string | null;
  onBack: () => void;
  focusOnMount: boolean;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [confirmDoNotContact, setConfirmDoNotContact] = useState(false);
  const [telegramPreparation, setTelegramPreparation] = useState<LeadRadarTelegramOutreachPreparation | null>(null);
  const [telegramPreparationLoading, setTelegramPreparationLoading] = useState(false);
  const [telegramPreparationError, setTelegramPreparationError] = useState<string | null>(null);
  const [telegramDraftLanguage, setTelegramDraftLanguage] = useState<CorporateDraftLanguage>('ru');
  const [telegramDraftText, setTelegramDraftText] = useState(() => boundTelegramDraftText(companyMessage(lead, offer, 'ru')));
  const [telegramApprovalConfirmed, setTelegramApprovalConfirmed] = useState(false);
  const [telegramSendLoading, setTelegramSendLoading] = useState(false);
  const [telegramAutomaticSendLocked, setTelegramAutomaticSendLocked] = useState(
    () => hasTelegramAutomaticSendLock(lead.id),
  );
  const [telegramSendResult, setTelegramSendResult] = useState<TelegramSendResult>(
    () => hasTelegramAutomaticSendLock(lead.id) ? 'error' : 'idle',
  );
  const [telegramSendNotice, setTelegramSendNotice] = useState<string | null>(
    () => hasTelegramAutomaticSendLock(lead.id)
      ? 'Предыдущая отправка имеет неизвестный итог. Автоотправка для этой компании заблокирована до отдельной серверной сверки; проверьте чат и используйте только ручной черновик.'
      : null,
  );
  const telegramPreparationSequence = useRef(0);
  const telegramSendSequence = useRef(0);
  const telegramAutomaticSendLockedRef = useRef(telegramAutomaticSendLocked);
  const priority = PRIORITY_COPY[lead.priority];
  const decisionMakers = decisionMakersFor(lead);
  const personalDecisionMakers = lead.suppressed || !contactEnabled
    ? []
    : decisionMakers.filter((person) => isMessageableDecisionMaker(lead, person));
  const companyTelegram = companyTelegramFor(lead);
  const corporateTelegram = companyTelegram && !decisionMakers.some((person) => isMessageableDecisionMaker(lead, person))
    ? companyTelegram
    : null;
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(personalDecisionMakers[0]?.id ?? null);
  const selectedPerson = personalDecisionMakers.find((person) => person.id === selectedPersonId)
    ?? personalDecisionMakers[0]
    ?? null;
  const message = selectedPerson ? leadMessage(lead, offer, selectedPerson) : '';
  const locallyVerifiedCorporate = isLocallyVerifiedCorporateBusinessContact(corporateTelegram);
  const localTelegramEndpoint = telegramEndpointFor(corporateTelegram, lead.suppressed);

  async function prepareCorporateTelegramOutreach(): Promise<void> {
    if (!contactEnabled || lead.suppressed || !locallyVerifiedCorporate) return;
    if (!isTelegramDraftTextReady(telegramDraftText)) {
      setTelegramPreparation(null);
      setTelegramPreparationError('Введите непустой текст длиной не более 4096 символов Unicode.');
      return;
    }
    const sequence = telegramPreparationSequence.current + 1;
    telegramPreparationSequence.current = sequence;
    setTelegramPreparationLoading(true);
    setTelegramPreparationError(null);
    try {
      const next = await loadVerifiedCorporateTelegramPreparation(lead.id, telegramDraftText);
      if (telegramPreparationSequence.current !== sequence) return;
      setTelegramPreparation(next);
    } catch (prepareError) {
      if (telegramPreparationSequence.current !== sequence) return;
      setTelegramPreparation(null);
      setTelegramPreparationError(errorCopy(prepareError));
    } finally {
      if (telegramPreparationSequence.current === sequence) setTelegramPreparationLoading(false);
    }
  }

  function updateCorporateTelegramDraft(language: CorporateDraftLanguage, text: string): void {
    if (telegramSendLoading) return;
    telegramPreparationSequence.current += 1;
    telegramSendSequence.current += 1;
    setTelegramDraftLanguage(language);
    setTelegramDraftText(boundTelegramDraftText(text));
    setTelegramPreparation(null);
    setTelegramPreparationLoading(false);
    setTelegramPreparationError(null);
    setTelegramApprovalConfirmed(false);
    if (!telegramAutomaticSendLockedRef.current) {
      setTelegramSendResult('idle');
      setTelegramSendNotice(null);
    }
  }

  useEffect(() => {
    if (focusOnMount) titleRef.current?.focus();
  }, [focusOnMount, lead.id]);

  useEffect(() => {
    setTelegramPreparation(null);
    setTelegramPreparationError(null);
    setTelegramApprovalConfirmed(false);
    setTelegramSendLoading(false);
    if (!telegramAutomaticSendLockedRef.current) {
      setTelegramSendResult('idle');
      setTelegramSendNotice(null);
    }
    if (contactEnabled && !lead.suppressed && locallyVerifiedCorporate && isTelegramDraftTextReady(telegramDraftText)) {
      const sequence = telegramPreparationSequence.current + 1;
      telegramPreparationSequence.current = sequence;
      setTelegramPreparationLoading(true);
      const timer = window.setTimeout(() => {
        void loadVerifiedCorporateTelegramPreparation(lead.id, telegramDraftText)
          .then((next) => {
            if (telegramPreparationSequence.current === sequence) setTelegramPreparation(next);
          })
          .catch((prepareError: unknown) => {
            if (telegramPreparationSequence.current !== sequence) return;
            setTelegramPreparation(null);
            setTelegramPreparationError(errorCopy(prepareError));
          })
          .finally(() => {
            if (telegramPreparationSequence.current === sequence) setTelegramPreparationLoading(false);
          });
      }, 500);
      return () => {
        window.clearTimeout(timer);
        telegramPreparationSequence.current += 1;
      };
    }
    if (contactEnabled && !lead.suppressed && locallyVerifiedCorporate) {
      setTelegramPreparationLoading(false);
      setTelegramPreparationError('Введите непустой текст длиной не более 4096 символов Unicode.');
    }
    return () => {
      telegramPreparationSequence.current += 1;
    };
  }, [contactEnabled, lead.id, lead.suppressed, locallyVerifiedCorporate, telegramDraftText]);

  useEffect(() => () => {
    telegramPreparationSequence.current += 1;
    telegramSendSequence.current += 1;
  }, []);

  async function sendTelegramBusinessMessage(): Promise<void> {
    if (telegramSendLoading
      || telegramAutomaticSendLocked
      || telegramAutomaticSendLockedRef.current
      || !telegramApprovalConfirmed
      || !telegramPreparation?.activeChatEligible
      || !telegramPreparation.bindingId
      || !isVerifiedCorporateBusinessEndpoint(telegramPreparation.endpoint)
      || !isTelegramDraftTextReady(telegramDraftText)) return;
    const preparation = telegramPreparation;
    const bindingId = preparation.bindingId;
    if (!bindingId) return;
    const text = telegramDraftText;
    const sendSequence = telegramSendSequence.current + 1;
    telegramSendSequence.current = sendSequence;
    const idempotencyKey = `lead-radar-telegram-ui-${crypto.randomUUID()}`;
    let providerBoundaryEntered = false;
    setTelegramSendLoading(true);
    setTelegramSendResult('idle');
    setTelegramSendNotice(null);
    try {
      const approval = await api.leadRadarApproveTelegramBusiness(lead.id, {
        bindingId,
        text,
      });
      const approvalExpiresAt = Date.parse(approval.expiresAt);
      if (!/^lrap_[A-Za-z0-9_-]{43}$/u.test(approval.approvalToken)
        || !Number.isFinite(approvalExpiresAt)
        || approvalExpiresAt <= Date.now()
        || approvalExpiresAt > Date.now() + 10 * 60_000) {
        throw Object.assign(new Error('Invalid Telegram approval grant'), {
          code: 'telegram_business_approval_required',
          status: 502,
        });
      }
      if (telegramSendSequence.current !== sendSequence) return;
      providerBoundaryEntered = true;
      const sent = await api.leadRadarSendTelegramBusiness(
        lead.id,
        {
          bindingId,
          text,
          approvalToken: approval.approvalToken,
        },
        idempotencyKey,
      );
      if (!/^lrtgs_[0-9a-f]{32}$/u.test(sent.effectId)
        || !['sent', 'replayed', 'ambiguous'].includes(sent.status)) {
        throw Object.assign(new Error('Invalid Telegram send response'), {
          code: 'telegram_business_send_ambiguous',
        });
      }
      if (sent.status === 'ambiguous') {
        persistTelegramAutomaticSendLock(lead.id);
        telegramAutomaticSendLockedRef.current = true;
        setTelegramAutomaticSendLocked(true);
        setTelegramApprovalConfirmed(false);
        setTelegramSendResult('error');
        setTelegramSendNotice('Итог отправки неизвестен. Повтор автоматически не выполняется и новая автоотправка для этой компании заблокирована. Проверьте чат вручную.');
        return;
      }
      setTelegramApprovalConfirmed(false);
      setTelegramSendResult('sent');
      setTelegramSendNotice(sent.status === 'replayed'
        ? 'Сервер подтвердил ранее завершённую отправку; повторного сообщения в Telegram не создавалось.'
        : 'Telegram подтвердил отправку в активный чат компании.');
    } catch (sendError) {
      const ambiguous = providerBoundaryEntered && isAmbiguousTelegramSendError(sendError);
      setTelegramSendResult('error');
      telegramAutomaticSendLockedRef.current = ambiguous;
      setTelegramAutomaticSendLocked(ambiguous);
      if (ambiguous) persistTelegramAutomaticSendLock(lead.id);
      setTelegramSendNotice(ambiguous
        ? 'Итог отправки неизвестен. Повтор автоматически не выполняется и новая автоотправка для этой карточки заблокирована. Проверьте чат вручную.'
        : errorCopy(sendError));
    } finally {
      setTelegramSendLoading(false);
    }
  }

  async function copyMessage(): Promise<void> {
    if (!contactEnabled || lead.suppressed || !selectedPerson || !message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopyError(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }

  function requestLifecycle(lifecycle: LeadRadarLifecycle): void {
    if (lifecycle === 'do_not_contact') {
      setConfirmDoNotContact(true);
      return;
    }
    onLifecycle(lifecycle);
  }

  const companyType = corporateTelegram ? CONTACT_TYPE_COPY[corporateTelegram.type] : null;

  return (
    <article className="min-w-0 overflow-hidden rounded-[1.75rem] border border-white/[0.09] bg-[#08111f]/90 shadow-[0_30px_100px_-55px_rgba(34,158,217,.65)]">
      <div className="border-b border-white/[0.07] bg-[radial-gradient(circle_at_85%_0%,rgba(47,230,209,.12),transparent_35%)] p-5 sm:p-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.1] px-3 text-sm text-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan xl:hidden"
        >
          <ArrowLeft size={17} aria-hidden="true" />К списку компаний
        </button>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={priority.tone}>{lead.priority} · {priority.title}</Badge>
              {decisionMakers.some(isPublishedDecisionMaker) && <Badge tone="info">Роль указана в публичном источнике</Badge>}
              {lead.suppressed && <Badge tone="danger">Не контактировать</Badge>}
              <span className="text-xs text-white/60">проверено {formatDate(lead.lastVerifiedAt)}</span>
            </div>
            <h2 ref={titleRef} tabIndex={-1} className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-white focus:outline-none sm:text-3xl">{lead.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/65">
              <span className="flex items-center gap-1.5"><BriefcaseBusiness size={14} aria-hidden="true" />{lead.category}</span>
              <span className="flex items-center gap-1.5"><MapPin size={14} aria-hidden="true" />{lead.city}</span>
            </div>
          </div>
          <ScoreRing value={lead.score} />
        </div>
        <p className="mt-5 max-w-2xl text-sm leading-6 text-white/70">{priority.body}</p>

        {contactEnabled && !lead.suppressed && selectedPerson ? (
          <div className="mt-5 rounded-2xl border border-brand-cyan/20 bg-brand-cyan/[0.055] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-cyan">Выбранный ЛПР</p>
                <p className="mt-1 text-sm font-semibold text-white">{selectedPerson.name} · {selectedPerson.role}</p>
              </div>
              <Badge tone="success">Сопоставление одобрено владельцем</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <a
                href={selectedPerson.telegramUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-grad-cta px-4 text-sm font-semibold text-[#04101a] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
              >
                <MessageCircle size={17} aria-hidden="true" />Написать ЛПР в Telegram<ExternalLink size={14} aria-hidden="true" />
              </a>
              <button
                type="button"
                onClick={copyMessage}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.045] px-4 text-sm font-medium text-white transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
              >
                {copied ? <Check size={17} className="text-emerald-300" aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
                {copied ? 'Сообщение скопировано' : 'Скопировать сообщение'}
              </button>
            </div>
            <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-white/65">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-brand-cyan" aria-hidden="true" />
              Только персональное деловое обращение по публичному контакту; массовые рассылки запрещены.
            </p>
          </div>
        ) : contactEnabled && !lead.suppressed ? (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-white/[0.09] bg-white/[0.025] p-4 text-sm leading-6 text-white/65">
            <UserRound size={19} className="mt-0.5 shrink-0 text-white/55" aria-hidden="true" />
            <div><strong className="text-white">Нет вручную одобренного личного Telegram.</strong> Автоматически найденные упоминания нужно сопоставить с публичным профилем. Корпоративные аккаунты, боты и каналы не используются для персонального сообщения.</div>
          </div>
        ) : null}

        {!lead.suppressed && (
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={() => setConfirmDoNotContact(true)} className="inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-medium text-white/65 hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
              Не связываться с этой компанией
            </button>
          </div>
        )}
        {confirmDoNotContact && !lead.suppressed && (
          <div role="group" aria-label="Подтверждение запрета на обращение" className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-400/[0.055] p-4">
            <p className="text-sm leading-6 text-white/80">Удалить сохранённые контакты и доказательства, отключить обращения и исключить компанию из новых поисков? Минимальные идентификаторы останутся только для соблюдения этого запрета.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button type="button" disabled={busy} onClick={() => { setConfirmDoNotContact(false); onLifecycle('do_not_contact'); }} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-rose-300/25 bg-rose-400/[0.1] px-3 text-xs font-semibold text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 disabled:cursor-wait disabled:opacity-50">Подтвердить запрет</button>
              <button type="button" onClick={() => setConfirmDoNotContact(false)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/[0.1] px-3 text-xs font-medium text-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">Отмена</button>
            </div>
          </div>
        )}

        <p className="sr-only" role="status" aria-live="polite">
          {copied ? 'Сообщение скопировано' : copyError ? 'Не удалось скопировать сообщение' : ''}
        </p>
        {lead.suppressed && <p className="mt-3 text-xs leading-5 text-rose-200/90">Для компании установлен постоянный запрет на обращение. Контакты и доказательства удалены; минимальные идентификаторы хранятся только для предотвращения повторного добавления.</p>}
        {copyError && <p className="mt-3 text-xs leading-5 text-amber-200/90">Браузер запретил доступ к буферу обмена. Разрешите копирование и повторите.</p>}
      </div>

      <div className="grid gap-0">
        <div className="space-y-7 border-b border-white/[0.07] p-5 sm:p-6">
          {contactEnabled && !lead.suppressed && <section aria-labelledby="decision-makers-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-cyan">Персональный контакт</p>
                <h3 id="decision-makers-title" className="mt-1 text-base font-semibold text-white">Лица, принимающие решение</h3>
              </div>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-white/70">{decisionMakers.length}</span>
            </div>
            {decisionMakers.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {decisionMakers.map((person) => {
                  const kind = CONTACT_TYPE_COPY[person.contactType];
                  const personal = isMessageableDecisionMaker(lead, person);
                  const published = isPublishedDecisionMaker(person);
                  const selected = selectedPerson?.id === person.id;
                  const review = REVIEW_STATUS_COPY[person.contactReviewStatus];
                  const reviewBusy = reviewBusyId === person.id;
                  const canReviewTelegram = person.contactType === 'human' && Boolean(person.telegramUrl);
                  return (
                    <article key={person.id} className={`rounded-2xl border p-4 ${selected ? 'border-brand-cyan/35 bg-brand-cyan/[0.06]' : 'border-white/[0.08] bg-white/[0.018]'}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-white">{person.name}</h4>
                            {published && <Badge tone="info">Роль опубликована</Badge>}
                            <Badge tone={kind.tone}><span className="inline-flex items-center gap-1">{person.contactType === 'bot' && <Bot size={12} aria-hidden="true" />}{kind.label}</span></Badge>
                            {canReviewTelegram && <Badge tone={review.tone}>{review.label}</Badge>}
                          </div>
                          <p className="mt-1 text-sm text-white/70">{person.role}</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <div className="text-xs font-semibold tabular-nums text-white">{contactConfidence(person.confidence)}%</div>
                          <div className="mt-0.5 text-[11px] text-white/60">сила совпадения данных</div>
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-white/70">{person.evidence}</p>
                      <p className="mt-2 text-xs leading-5 text-white/60">{SOURCE_CLAIM_COPY[person.sourceClaim]}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/60">
                        <span className="inline-flex items-center gap-1.5"><AtSign size={13} aria-hidden="true" />{person.telegramUsername ? `@${person.telegramUsername.replace(/^@/, '')}` : 'username не найден'}</span>
                        <span>проверено {formatDate(person.verifiedAt)}</span>
                      </div>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <a href={person.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.1] px-3 text-xs font-medium text-white/75 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
                          <FileCheck2 size={14} aria-hidden="true" />Открыть доказательство<ExternalLink size={13} aria-hidden="true" />
                        </a>
                        {canReviewTelegram && person.telegramUrl && (
                          <a href={person.telegramUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.1] px-3 text-xs font-medium text-white/75 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
                            <AtSign size={14} aria-hidden="true" />Проверить профиль<ExternalLink size={13} aria-hidden="true" />
                          </a>
                        )}
                        {personal && (
                          <>
                            <button type="button" onClick={() => setSelectedPersonId(person.id)} aria-pressed={selected} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-brand-cyan/25 bg-brand-cyan/[0.07] px-3 text-xs font-semibold text-brand-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
                              <UserRoundCheck size={14} aria-hidden="true" />{selected ? 'Выбран для сообщения' : 'Выбрать для сообщения'}
                            </button>
                            <button type="button" disabled={reviewBusy} onClick={() => onReviewContact(person.id, 'rejected')} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/[0.1] px-3 text-xs font-medium text-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:cursor-wait disabled:opacity-50">
                              Отозвать одобрение
                            </button>
                          </>
                        )}
                      </div>
                      {canReviewTelegram && !personal && (
                        <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                          <p className="text-xs leading-5 text-white/65">{person.contactReviewStatus === 'approved' ? 'Сопоставление сохранено. Контактное действие появится только после подтверждения обновлённого состояния сервером.' : 'Сначала откройте доказательство и профиль. Одобрение означает только ручное сопоставление публичных данных, а не проверку личности.'}</p>
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            {person.contactReviewStatus !== 'approved' && (
                              <button
                                type="button"
                                disabled={reviewBusy}
                                onClick={() => onReviewContact(person.id, 'approved')}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-brand-cyan/25 bg-brand-cyan/[0.07] px-3 text-xs font-semibold text-brand-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:cursor-wait disabled:opacity-50"
                              >
                                <UserRoundCheck size={14} aria-hidden="true" />{reviewBusy ? 'Сохраняем…' : person.contactReviewStatus === 'rejected' ? 'Одобрить после повторной проверки' : 'Подтвердить сопоставление'}
                              </button>
                            )}
                            {person.contactReviewStatus !== 'rejected' && (
                              <button
                                type="button"
                                disabled={reviewBusy}
                                onClick={() => onReviewContact(person.id, 'rejected')}
                                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/[0.1] px-3 text-xs font-medium text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:cursor-wait disabled:opacity-50"
                              >
                                Отклонить контакт
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-white/[0.1] p-4 text-sm leading-6 text-white/60">
                Проверяемое имя и роль ЛПР пока не найдены. Корпоративный Telegram ниже не считается персональным контактом.
              </div>
            )}
          </section>}

          {!lead.suppressed && <section aria-labelledby="corporate-channels-title">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Компания</p>
              <h3 id="corporate-channels-title" className="mt-1 text-base font-semibold text-white">Корпоративные каналы</h3>
            </div>
            <ContactCandidates key={lead.id} candidates={lead.contactCandidates} enrichment={lead.contactEnrichment} searchId={lead.searchId} companyId={lead.id} canCheck={canCheckContacts} onResolved={onContactResolved} />
            <WebsiteCollectorCard key={lead.id} companyId={lead.id} website={lead.website} onContactsUpdated={onWebsiteContactsUpdated} />
            <div className="mt-4 grid gap-3 text-sm">
              {corporateTelegram && companyType && (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.018] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 font-medium text-white">
                      {corporateTelegram.type === 'bot' ? <Bot size={17} className="text-rose-300" aria-hidden="true" /> : <MessageCircle size={17} className="text-brand-cyan" aria-hidden="true" />}
                      Telegram компании
                    </div>
                    <Badge tone={companyType.tone}><span className="inline-flex items-center gap-1">{corporateTelegram.type === 'bot' && <Bot size={12} aria-hidden="true" />}{companyType.label}</span></Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/70">{corporateTelegram.reason || 'Канал показан отдельно и не считается подтверждённым ЛПР.'}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/60">
                    {corporateTelegram.username && <span>@{corporateTelegram.username.replace(/^@/, '')}</span>}
                    <span>{contactConfidence(corporateTelegram.confidence)}% уверенности классификации</span>
                    <span>проверено {formatDate(corporateTelegram.verifiedAt)}</span>
                  </div>
                    <a href={corporateTelegram.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/[0.1] px-3 text-xs font-medium text-white/75 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
                    Проверить аккаунт как источник<ExternalLink size={13} aria-hidden="true" />
                  </a>
                </div>
              )}
              {lead.website && <a href={lead.website} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.08] px-3 text-white/70 hover:bg-white/[0.03] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"><Globe2 size={15} className="text-brand-cyan" aria-hidden="true" /><span className="truncate">{lead.website}</span></a>}
              {lead.phone && (contactEnabled
                ? <a href={`tel:${lead.phone}`} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.08] px-3 text-white/70 hover:bg-white/[0.03] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"><Phone size={15} className="text-brand-cyan" aria-hidden="true" />{lead.phone}</a>
                : <div className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.08] px-3 text-white/70"><Phone size={15} className="text-brand-cyan" aria-hidden="true" />{lead.phone}<span className="ml-auto text-[10px] text-white/45">действие отключено</span></div>)}
              {lead.genericEmail && (contactEnabled
                ? <a href={`mailto:${lead.genericEmail}`} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.08] px-3 text-white/70 hover:bg-white/[0.03] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"><MessageCircle size={15} className="text-brand-cyan" aria-hidden="true" />{lead.genericEmail}</a>
                : <div className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.08] px-3 text-white/70"><MessageCircle size={15} className="text-brand-cyan" aria-hidden="true" />{lead.genericEmail}<span className="ml-auto text-[10px] text-white/45">действие отключено</span></div>)}
              {!corporateTelegram && !lead.website && !lead.phone && !lead.genericEmail && <p className="rounded-2xl border border-dashed border-white/[0.1] p-4 text-sm text-white/60">Проверенный корпоративный канал пока не найден.</p>}
            </div>
          </section>}

          {contactEnabled && !lead.suppressed && corporateTelegram && (
            <div className="space-y-3">
              {locallyVerifiedCorporate && (
                <div className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-4">
                  <fieldset disabled={telegramSendLoading}>
                    <legend className="text-sm font-semibold text-white">Язык корпоративного черновика</legend>
                    <div className="mt-3 grid grid-cols-2 gap-3" aria-label="Выбор языка Telegram-сообщения">
                      {(['ru', 'uz'] as const).map((language) => (
                        <button
                          key={language}
                          type="button"
                          aria-pressed={telegramDraftLanguage === language}
                          onClick={() => updateCorporateTelegramDraft(language, companyMessage(lead, offer, language))}
                          className={`min-h-12 rounded-xl border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base ${telegramDraftLanguage === language ? 'border-brand-cyan/35 bg-brand-cyan/[0.09] text-brand-cyan' : 'border-white/[0.1] bg-white/[0.025] text-white/70 hover:bg-white/[0.05] hover:text-white'}`}
                        >
                          {language === 'ru' ? 'Русский' : 'O‘zbekcha'}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-white/65">Переключение языка заменит текущий текст нейтральным шаблоном.</p>
                  </fieldset>

                  <div className="mt-4">
                    <Label htmlFor={`telegram-company-draft-${lead.id}`}>Текст сообщения компании</Label>
                    <Textarea
                      id={`telegram-company-draft-${lead.id}`}
                      value={telegramDraftText}
                      rows={9}
                      disabled={telegramSendLoading}
                      aria-describedby={`telegram-company-draft-help-${lead.id}`}
                      onChange={(event) => updateCorporateTelegramDraft(telegramDraftLanguage, event.target.value)}
                      className="min-h-48 resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                    />
                    <div id={`telegram-company-draft-help-${lead.id}`} className="mt-2 flex flex-col gap-1 text-xs leading-5 text-white/65 sm:flex-row sm:items-center sm:justify-between">
                      <span>Проверьте факты: ссылка и Business-отправка используют этот текст без изменений.</span>
                      <span className="shrink-0 tabular-nums">{[...telegramDraftText].length}/4096</span>
                    </div>
                  </div>
                </div>
              )}

              {locallyVerifiedCorporate && telegramPreparationLoading ? (
                <div role="status" aria-live="polite" className="flex min-h-20 items-center gap-3 rounded-2xl border border-white/[0.09] bg-white/[0.025] p-4 text-sm text-white/70">
                  <LoaderCircle size={18} className="shrink-0 text-brand-cyan motion-safe:animate-spin" aria-hidden="true" />
                  Проверяем безопасный черновик и доступность активного Business-чата…
                </div>
              ) : locallyVerifiedCorporate && telegramPreparationError ? (
                <div role="alert" className="rounded-2xl border border-amber-300/18 bg-amber-300/[0.045] p-4">
                  <p className="text-sm leading-6 text-amber-50/85">{telegramPreparationError}</p>
                  <Button type="button" variant="secondary" onClick={() => { void prepareCorporateTelegramOutreach(); }} className="mt-3 min-h-12 w-full sm:w-auto">
                    <RefreshCw size={17} aria-hidden="true" />Повторить безопасную проверку
                  </Button>
                </div>
              ) : (
                <TelegramOutreachActions
                  endpoint={telegramPreparation?.endpoint ?? localTelegramEndpoint}
                  manualDraftUrl={telegramPreparation?.manualDraftUrl}
                  activeChatEligible={Boolean(
                    telegramPreparation?.activeChatEligible
                    && !telegramAutomaticSendLocked
                    && telegramSendResult !== 'sent',
                  )}
                  approvalConfirmed={telegramApprovalConfirmed}
                  onApprovalChange={(confirmed) => {
                    setTelegramApprovalConfirmed(confirmed);
                    if (!confirmed) {
                      if (!telegramAutomaticSendLocked && telegramSendResult !== 'sent') setTelegramSendResult('idle');
                    }
                  }}
                  onSend={() => { void sendTelegramBusinessMessage(); }}
                  sendLoading={telegramSendLoading}
                  sendResult={telegramSendResult}
                />
              )}
              {telegramPreparation?.lastInboundAt && (
                <p className="text-xs leading-5 text-white/65">
                  Последняя подтверждённая входящая активность: {formatDate(telegramPreparation.lastInboundAt)}.
                </p>
              )}
              {telegramSendNotice && (
                <p
                  role={telegramSendResult === 'error' ? 'alert' : 'status'}
                  aria-live="polite"
                  className={`rounded-xl border p-3 text-sm leading-6 ${telegramSendResult === 'error' ? 'border-amber-300/18 bg-amber-300/[0.045] text-amber-50/85' : 'border-emerald-300/18 bg-emerald-300/[0.045] text-emerald-50/85'}`}
                >
                  {telegramSendNotice}
                </p>
              )}
            </div>
          )}

          <section aria-labelledby="why-fit">
            <div className="flex items-center justify-between gap-3">
              <h3 id="why-fit" className="text-sm font-semibold text-white">Почему компания в выдаче</h3>
              <span className="text-xs text-white/60">Оценка ≠ вероятность сделки</span>
            </div>
            <div className="mt-4 space-y-4">
              {lead.scoreComponents.map((component) => (
                <div key={component.key}>
                  <div className="flex items-center justify-between gap-4 text-xs">
                    <span className="text-white/70">{component.label}</span>
                    <span className="font-medium tabular-nums text-white">{component.score}/{component.max}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-blue to-brand-cyan" style={{ width: `${Math.round(component.score / component.max * 100)}%` }} />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-white/65">{component.reason}</p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="signals-title">
            <h3 id="signals-title" className="text-sm font-semibold text-white">Подтверждённые сигналы</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {lead.signals.length > 0 ? lead.signals.map((signal) => (
                <span key={`${signal.type}-${signal.label}`} className="inline-flex items-center gap-1.5 rounded-full border border-brand-cyan/15 bg-brand-cyan/[0.06] px-3 py-2 text-xs text-white/70">
                  <Activity size={13} className="text-brand-cyan" aria-hidden="true" />{signal.label}
                </span>
              )) : <span className="text-sm text-white/60">Активные сигналы спроса ещё не подтверждены.</span>}
            </div>
          </section>
        </div>

        <div className="space-y-7 p-5 sm:p-6">
          <section aria-labelledby="evidence-title">
            <div className="flex items-center justify-between gap-3">
              <h3 id="evidence-title" className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck size={16} className="text-brand-cyan" aria-hidden="true" />Доказательства компании</h3>
              <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-xs tabular-nums text-white/70">{lead.evidence.length}</span>
            </div>
            <div className="mt-3 max-h-[24rem] space-y-2 overflow-y-auto pr-1">
              {lead.evidence.map((item) => (
                <a key={item.id} href={item.sourceUrl} target="_blank" rel="noreferrer" className="block rounded-xl border border-white/[0.08] bg-white/[0.018] p-3 transition-colors hover:border-white/15 hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">{item.fieldPath}</div>
                      <div className="mt-1 truncate text-xs text-white/75">{item.value}</div>
                    </div>
                    <span className="shrink-0 text-[10px] tabular-nums text-brand-cyan">{Math.round(item.confidence * 100)}%</span>
                  </div>
                </a>
              ))}
            </div>
          </section>

          <section aria-labelledby="pipeline-title">
            <h3 id="pipeline-title" className="text-sm font-semibold text-white">Статус в продажах</h3>
            <Label htmlFor={`lead-lifecycle-${lead.id}`}>Следующий шаг</Label>
            <Select id={`lead-lifecycle-${lead.id}`} value={lead.lifecycle} disabled={busy || lead.suppressed || !contactEnabled} onChange={(event) => requestLifecycle(event.target.value as LeadRadarLifecycle)} className="min-h-12">
              {Object.entries(LIFECYCLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
            <p className="mt-2 text-xs leading-5 text-white/60">«Не связываться» удаляет контакты и доказательства. Минимальные идентификаторы остаются только для исключения компании из новых поисков.</p>
          </section>

          {contactEnabled && !lead.suppressed && selectedPerson && <section aria-labelledby="draft-title">
            <h3 id="draft-title" className="text-sm font-semibold text-white">Черновик для {selectedPerson.name}</h3>
            <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-white/[0.08] bg-[#05070d] p-4 text-xs leading-5 text-white/70">{message}</div>
          </section>}
        </div>
      </div>
    </article>
  );
}

export default function LeadRadarPage() {
  const [view,setView]=useState<'search'|'contacts'>(()=>new URLSearchParams(window.location.search).get('view')==='contacts'?'contacts':'search');
  function changeView(next:'search'|'contacts') {
    setView(next);
    const url=new URL(window.location.href);url.searchParams.set('view',next);window.history.replaceState(null,'',url);
  }
  // A Signal Radar handoff arrives as a URL, once, at mount. It is not a live
  // binding: from here on the draft belongs to the operator.
  const [handoff, setHandoff] = useState<SignalHandoff | null>(
    () => parseSignalHandoff(new URLSearchParams(window.location.search)),
  );
  const [draftInput, setDraftInput] = useState<LeadRadarSearchInput>(() => (
    handoff ? leadRadarPrefillFromHandoff(handoff, DEFAULT_INPUT) : DEFAULT_INPUT
  ));
  const [pendingSearchInput, setPendingSearchInput] = useState<LeadRadarSearchInput | null>(null);
  const [searchAttemptError, setSearchAttemptError] = useState<SearchAttemptError | null>(null);
  const [overview, setOverview] = useState<LeadRadarOverview | null>(null);
  const [result, setResult] = useState<LeadRadarSearchResult | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadFilter, setLeadFilter] = useState<LeadFilter>('all');
  const [visibleLeadLimit, setVisibleLeadLimit] = useState(20);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [statusBusy, setStatusBusy] = useState(false);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [pollingDelayed, setPollingDelayed] = useState(false);
  const [pollingStopped, setPollingStopped] = useState(false);
  const [pollingRevision, setPollingRevision] = useState(0);
  const [pulseBusy, setPulseBusy] = useState(false);
  const [pulseNotice, setPulseNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overviewError, setOverviewError] = useState(false);
  const [overviewErrorHint, setOverviewErrorHint] = useState('');
  const [telegramBusinessStatus, setTelegramBusinessStatus] = useState<LeadRadarTelegramBusinessStatus | null>(null);
  const [telegramStatusLoading, setTelegramStatusLoading] = useState(false);
  const [telegramConnectionBusy, setTelegramConnectionBusy] = useState(false);
  const [telegramConnectionNotice, setTelegramConnectionNotice] = useState<string | null>(null);
  const [telegramConnectLink, setTelegramConnectLink] = useState<LeadRadarTelegramBusinessConnectLink | null>(null);
  const [telegramStatusPollingStopped, setTelegramStatusPollingStopped] = useState(false);
  const requestSequence = useRef(0);
  const pulseInFlight = useRef(false);
  const pulseOperationSequence = useRef(0);
  const pendingSearchRequestKey = useRef<string | null>(null);
  const pendingTelegramConnectRequestKey = useRef<string | null>(null);
  const telegramStatusRequestSequence = useRef(0);
  const telegramStatusPollingDeadline = useRef<number | null>(null);
  const capabilities = result?.capabilities ?? overview?.capabilities ?? {
    admissionEnabled: false,
    processingEnabled: false,
    contactEnabled: false,
    mode: 'paused' as const,
  };
  // Backward compatibility: old responses only carry admission/contact. New
  // responses separate research, personal data and each outreach surface.
  const telegramDiscoveryEnabled = capabilities.telegramDiscoveryEnabled
    ?? capabilities.admissionEnabled;
  const personalContactsEnabled = capabilities.personalContactsEnabled
    ?? capabilities.contactEnabled;
  const individualOutreachEnabled = capabilities.individualOutreachEnabled
    ?? capabilities.contactEnabled;
  const telegramAccountEnabled = capabilities.telegramAccountEnabled ?? false;
  const telegramAccountReadiness = capabilities.telegramAccountReadiness;
  const campaignOutreachEnabled = capabilities.campaignOutreachEnabled ?? false;
  const campaignAutoSendEnabled = capabilities.campaignAutoSendEnabled ?? false;
  const telegramCampaignDailyLimit = capabilities.telegramCampaignDailyLimit
    ?? LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_DAILY_LIMIT;
  const telegramCampaignMinimumIntervalSeconds = capabilities.telegramCampaignMinimumIntervalSeconds
    ?? LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_MIN_INTERVAL_SECONDS;

  const loadOverview = useCallback(async (): Promise<LeadRadarOverview | null> => {
    try {
      const nextOverview = await api.leadRadarOverview();
      setOverview(nextOverview);
      setOverviewError(false);
      setOverviewErrorHint('');
      return nextOverview;
    } catch (failure) {
      setOverviewError(true);
      setOverviewErrorHint(requestFailureHint(failure));
      return null;
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const loadTelegramBusinessStatus = useCallback(async (): Promise<LeadRadarTelegramBusinessStatus | null> => {
    if (!individualOutreachEnabled) return null;
    const sequence = telegramStatusRequestSequence.current + 1;
    telegramStatusRequestSequence.current = sequence;
    setTelegramStatusLoading(true);
    try {
      const next = await api.leadRadarTelegramBusinessStatus();
      if (telegramStatusRequestSequence.current !== sequence) return null;
      setTelegramBusinessStatus(next);
      setTelegramConnectionNotice(null);
      if (next.status !== 'pending') {
        telegramStatusPollingDeadline.current = null;
        setTelegramStatusPollingStopped(false);
      }
      if (next.status === 'connected') setTelegramConnectLink(null);
      return next;
    } catch (statusError) {
      if (telegramStatusRequestSequence.current !== sequence) return null;
      setTelegramBusinessStatus((current) => current ?? {
        status: 'error', canReply: false, connectedAt: null, activeCompanyChats: 0,
      });
      setTelegramConnectionNotice(errorCopy(statusError));
      return null;
    } finally {
      if (telegramStatusRequestSequence.current === sequence) setTelegramStatusLoading(false);
    }
  }, [individualOutreachEnabled]);

  useEffect(() => {
    if (!individualOutreachEnabled) {
      telegramStatusRequestSequence.current += 1;
      telegramStatusPollingDeadline.current = null;
      setTelegramBusinessStatus(null);
      setTelegramStatusLoading(false);
      setTelegramConnectionBusy(false);
      setTelegramConnectionNotice(null);
      setTelegramConnectLink(null);
      setTelegramStatusPollingStopped(false);
      pendingTelegramConnectRequestKey.current = null;
      return undefined;
    }
    void loadTelegramBusinessStatus();
    return () => {
      telegramStatusRequestSequence.current += 1;
    };
  }, [individualOutreachEnabled, loadTelegramBusinessStatus]);

  useEffect(() => {
    if (!individualOutreachEnabled
      || telegramBusinessStatus?.status !== 'pending'
      || telegramStatusPollingStopped) return undefined;
    telegramStatusPollingDeadline.current ??= Date.now() + 15 * 60_000;
    let cancelled = false;
    let timer: number | undefined;
    let consecutiveErrors = 0;
    const poll = async (): Promise<void> => {
      const deadline = telegramStatusPollingDeadline.current;
      if (deadline === null || Date.now() >= deadline) {
        setTelegramStatusPollingStopped(true);
        return;
      }
      const next = await loadTelegramBusinessStatus();
      if (cancelled || next?.status !== 'pending') return;
      consecutiveErrors = next ? 0 : consecutiveErrors + 1;
      const delay = Math.min(30_000, 5_000 * (2 ** Math.min(consecutiveErrors, 2)));
      timer = window.setTimeout(() => { void poll(); }, delay);
    };
    timer = window.setTimeout(() => { void poll(); }, 5_000);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [individualOutreachEnabled, loadTelegramBusinessStatus, telegramBusinessStatus?.status, telegramStatusPollingStopped]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async (): Promise<void> => {
      const nextOverview = await loadOverview();
      const runningSearch = nextOverview?.searches.find((search) => search.status === 'running');
      if (cancelled || !runningSearch) return;
      setLoading(true);
      try {
        const next = await api.leadRadarSearchResult(runningSearch.id);
        if (cancelled) return;
        setResult(next);
        setSelectedLeadId(next.leads[0]?.id ?? null);
        setLeadFilter('all');
      } catch {
        if (!cancelled) setError('Не удалось восстановить активный поиск. Откройте его из истории и повторите обновление.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void bootstrap();
    return () => { cancelled = true; };
  }, [loadOverview]);

  useEffect(() => {
    const searchId = result?.search.id;
    if (!searchId || result.search.status !== 'running' || result.capabilities?.processingEnabled === false) return undefined;
    setPollingStopped(false);
    let cancelled = false;
    let consecutiveErrors = 0;
    let timer: number | undefined;
    const pollingDeadline = Date.now() + 15 * 60_000;
    const poll = async (): Promise<void> => {
      if (Date.now() >= pollingDeadline) {
        setPollingStopped(true);
        setPollingDelayed(false);
        return;
      }
      try {
        const next = await api.leadRadarSearchResult(searchId);
        if (cancelled) return;
        consecutiveErrors = 0;
        setPollingDelayed(false);
        setPollingStopped(false);
        setResult(next);
        setSelectedLeadId((current) => current && next.leads.some((lead) => lead.id === current)
          ? current
          : next.leads[0]?.id ?? null);
        if (next.search.status !== 'running') {
          void loadOverview();
          return;
        }
      } catch {
        if (cancelled) return;
        consecutiveErrors += 1;
        if (consecutiveErrors >= 2) setPollingDelayed(true);
      }
      const delay = consecutiveErrors > 0
        ? Math.min(30_000, 3_000 * (2 ** Math.min(consecutiveErrors - 1, 3)))
        : 2_500;
      timer = window.setTimeout(() => { void poll(); }, delay);
    };
    timer = window.setTimeout(() => { void poll(); }, 1_500);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [loadOverview, pollingRevision, result?.capabilities?.processingEnabled, result?.search.id, result?.search.status]);

  useEffect(() => () => {
    pulseOperationSequence.current += 1;
    pulseInFlight.current = false;
  }, []);

  const visibleLeads = useMemo(() => {
    const filtered = (result?.leads ?? []).filter((lead) => {
      const decisionMakers = decisionMakersFor(lead);
      if (leadFilter === 'decision_maker') return decisionMakers.some(isPublishedDecisionMaker);
      if (leadFilter === 'personal_telegram') return decisionMakers.some((person) => isMessageableDecisionMaker(lead, person));
      if (leadFilter === 'P1') return lead.priority === 'P1';
      return true;
    });
    if (leadFilter !== 'all' || !result?.search.input.telegramRequired) return filtered;
    return filtered.toSorted((left, right) => (
      telegramDiscoveryPriority(right) - telegramDiscoveryPriority(left)
      || right.score - left.score
      || left.name.localeCompare(right.name, 'ru')
    ));
  }, [leadFilter, result]);
  const filterCounts = useMemo(() => {
    const leads = result?.leads ?? [];
    return {
      all: leads.length,
      decision_maker: leads.filter((lead) => decisionMakersFor(lead).some(isPublishedDecisionMaker)).length,
      personal_telegram: leads.filter((lead) => decisionMakersFor(lead).some((person) => isMessageableDecisionMaker(lead, person))).length,
      P1: leads.filter((lead) => lead.priority === 'P1').length,
    } satisfies Record<LeadFilter, number>;
  }, [result]);
  const selectedLead = visibleLeads.find((lead) => lead.id === selectedLeadId) ?? visibleLeads[0] ?? null;
  const failedCopy = result?.search.status === 'failed'
    ? FAILURE_COPY[result.search.errorCode ?? 'discovery_failed'] ?? FAILURE_COPY.discovery_failed
    : null;
  const searchTerminal = Boolean(result && result.search.status !== 'running');
  const noApprovedPersonalTelegram = Boolean(
    result
    && personalContactsEnabled
    && searchTerminal
    && result.leads.length > 0
    && result.search.funnel.personalTelegramCount === 0,
  );
  const draftDiffersFromOpenResult = Boolean(
    result && !sameSearchInput(draftInput, result.search.input),
  );
  const openResultLabel = result ? searchInputLabel(result.search.input) : null;

  async function runSearch(searchInput?: LeadRadarSearchInput): Promise<void> {
    const snapshot = cloneSearchInput(searchInput ?? draftInput);
    if (searchInput) setDraftInput(snapshot);
    const currentCapabilities = result?.capabilities ?? overview?.capabilities;
    if (!currentCapabilities?.admissionEnabled) {
      setSearchAttemptError({
        input: snapshot,
        message: 'Новые поиски временно приостановлены защитным переключателем. Сохранённые исследования остаются доступны.',
      });
      return;
    }
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setPendingSearchInput(snapshot);
    setSearchAttemptError(null);
    setLoading(true);
    setPollingDelayed(false);
    setPollingStopped(false);
    setPulseNotice(null);
    setReviewNotice(null);
    setError(null);
    const requestKey = pendingSearchRequestKey.current ?? `lead-radar-ui-${crypto.randomUUID()}`;
    pendingSearchRequestKey.current = requestKey;
    try {
      const next = await api.leadRadarSearch(snapshot, requestKey);
      pendingSearchRequestKey.current = null;
      if (requestSequence.current !== sequence) return;
      setResult(next);
      setPendingSearchInput(null);
      setSelectedLeadId(next.leads[0]?.id ?? null);
      setLeadFilter('all');
      setVisibleLeadLimit(20);
      setMobileDetailOpen(false);
      void loadOverview();
    } catch (searchError) {
      if (typeof (searchError as { status?: unknown })?.status === 'number') {
        // A definite HTTP response proves whether admission happened. Only an
        // ambiguous network/timeout failure reuses the same request key.
        pendingSearchRequestKey.current = null;
      }
      if (requestSequence.current !== sequence) return;
      setSearchAttemptError({ input: snapshot, message: errorCopy(searchError) });
    } finally {
      if (requestSequence.current === sequence) {
        setPendingSearchInput(null);
        setLoading(false);
      }
    }
  }

  async function openSearch(id: string, options: { restartPolling?: boolean } = {}): Promise<void> {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    const refreshingCurrentSearch = result?.search.id === id;
    if (options.restartPolling) setPollingRevision((current) => current + 1);
    if (!refreshingCurrentSearch) setPulseNotice(null);
    setLoading(true);
    setPollingDelayed(false);
    setPollingStopped(false);
    setReviewNotice(null);
    setSearchAttemptError(null);
    setError(null);
    try {
      const next = await api.leadRadarSearchResult(id);
      if (requestSequence.current !== sequence) return;
      setResult(next);
      setSelectedLeadId((current) => refreshingCurrentSearch && current && next.leads.some((lead) => lead.id === current)
        ? current
        : next.leads[0]?.id ?? null);
      if (!refreshingCurrentSearch) {
        setLeadFilter('all');
        setVisibleLeadLimit(20);
        setMobileDetailOpen(false);
      }
    } catch (loadError) {
      if (requestSequence.current !== sequence) return;
      setError(errorCopy(loadError));
    } finally {
      if (requestSequence.current === sequence) setLoading(false);
    }
  }

  async function pulseSearch(searchId: string): Promise<void> {
    if (pulseInFlight.current) return;
    pulseInFlight.current = true;
    const operation = pulseOperationSequence.current + 1;
    pulseOperationSequence.current = operation;
    const viewSequence = requestSequence.current;
    setPulseBusy(true);
    setPulseNotice(null);

    let successMessage: string;
    try {
      const pulse = await api.leadRadarPulseSearch(searchId);
      const settlement = leadRadarPulseSettlement({
        currentOperation: pulseOperationSequence.current,
        operation,
        currentView: requestSequence.current,
        view: viewSequence,
      });
      if (!settlement.mayPublish) {
        if (settlement.ownsOperation) {
          pulseInFlight.current = false;
          setPulseBusy(false);
        }
        return;
      }
      successMessage = leadRadarSearchPulseNotice(pulse);
      setPulseNotice({ kind: 'success', message: successMessage });
    } catch (pulseError) {
      const settlement = leadRadarPulseSettlement({
        currentOperation: pulseOperationSequence.current,
        operation,
        currentView: requestSequence.current,
        view: viewSequence,
      });
      if (settlement.mayPublish) {
        setPulseNotice({
          kind: 'error',
          message: `Партию не удалось поставить в обработку. ${errorCopy(pulseError)}`,
        });
      }
      if (settlement.ownsOperation) {
        pulseInFlight.current = false;
        setPulseBusy(false);
      }
      return;
    }

    // Queue processing is asynchronous. A delayed read is more useful than an
    // immediate snapshot that almost always repeats the pre-pulse counters.
    await new Promise<void>((resolve) => { window.setTimeout(resolve, 2_000); });
    const delayedSettlement = leadRadarPulseSettlement({
      currentOperation: pulseOperationSequence.current,
      operation,
      currentView: requestSequence.current,
      view: viewSequence,
    });
    if (!delayedSettlement.mayPublish) {
      if (delayedSettlement.ownsOperation) {
        pulseInFlight.current = false;
        setPulseBusy(false);
      }
      return;
    }
    try {
      const next = await api.leadRadarSearchResult(searchId);
      if (pulseOperationSequence.current !== operation || requestSequence.current !== viewSequence) return;
      setResult(next);
      setSelectedLeadId((current) => current && next.leads.some((lead) => lead.id === current)
        ? current
        : next.leads[0]?.id ?? null);
    } catch {
      if (pulseOperationSequence.current === operation && requestSequence.current === viewSequence) {
        setPulseNotice({
          kind: 'success',
          message: `${successMessage} Сервер принял действие, но свежий статус пока не прочитан — автообновление продолжит проверку.`,
        });
      }
    } finally {
      if (pulseOperationSequence.current === operation) {
        pulseInFlight.current = false;
        setPulseBusy(false);
        if (requestSequence.current === viewSequence) {
          setPollingDelayed(false);
          setPollingStopped(false);
          setPollingRevision((current) => current + 1);
        }
      }
    }
  }

  async function refreshCollectedContacts(searchId: string): Promise<void> {
    const sequence = requestSequence.current;
    const next = await api.leadRadarSearchResult(searchId);
    if (requestSequence.current !== sequence) return;
    // Keep selection, offer, audience and composer state intact during background collection.
    setResult((current) => current?.search.id === searchId ? next : current);
  }

  async function updateLifecycle(lifecycle: LeadRadarLifecycle): Promise<void> {
    if (!selectedLead || statusBusy) return;
    if (selectedLead.suppressed) return;
    setStatusBusy(true);
    setError(null);
    try {
      await api.leadRadarSetLifecycle(selectedLead.id, lifecycle);
      setResult((current) => current ? {
        ...current,
        leads: current.leads.map((lead) => lead.id === selectedLead.id
          ? {
            ...lead,
            lifecycle,
            suppressed: lifecycle === 'do_not_contact' || lead.suppressed,
            phone: lifecycle === 'do_not_contact' ? null : lead.phone,
            genericEmail: lifecycle === 'do_not_contact' ? null : lead.genericEmail,
            telegramUrl: lifecycle === 'do_not_contact' ? null : lead.telegramUrl,
            telegramContact: lifecycle === 'do_not_contact' ? null : lead.telegramContact,
            decisionMakers: lifecycle === 'do_not_contact' ? [] : lead.decisionMakers,
            evidence: lifecycle === 'do_not_contact' ? [] : lead.evidence,
          }
          : lead),
      } : current);
      void loadOverview();
    } catch (lifecycleError) {
      setError(errorCopy(lifecycleError));
    } finally {
      setStatusBusy(false);
    }
  }

  async function reviewDecisionMaker(personId: string, contactReviewStatus: 'approved' | 'rejected'): Promise<void> {
    if (!selectedLead || reviewBusyId) return;
    const leadId = selectedLead.id;
    setReviewBusyId(personId);
    setReviewNotice(null);
    setError(null);
    try {
      const review = await api.leadRadarReviewDecisionMaker(leadId, personId, contactReviewStatus);
      setResult((current) => {
        if (!current) return current;
        const leads = current.leads.map((lead) => {
          if (lead.id !== leadId) return lead;
          const contact = lead.telegramContact;
          const decisionMakers = lead.decisionMakers.map((person) => person.id === personId
            ? {
                ...person,
                contactReviewStatus: review.contactReviewStatus,
                contactReviewedAt: review.contactReviewedAt,
              }
            : person);
          return {
            ...lead,
            telegramContact: contact
              ? { ...contact, messageable: false }
              : contact,
            decisionMakers,
          };
        });
        const personalTelegramCount = leads.filter((lead) => (
          lead.decisionMakers.some((person) => isMessageableDecisionMaker(lead, person))
        )).length;
        return {
          ...current,
          leads,
          search: {
            ...current.search,
            telegramCount: personalTelegramCount,
            funnel: { ...current.search.funnel, personalTelegramCount },
          },
        };
      });
      try {
        const refreshed = await api.leadRadarSearchResult(selectedLead.searchId);
        setResult(refreshed);
      } catch {
        setReviewNotice('Решение сохранено, но обновлённое состояние не загрузилось. Контактное действие остаётся выключенным — обновите статус поиска или страницу.');
      }
      void loadOverview();
    } catch (reviewError) {
      setError(errorCopy(reviewError));
    } finally {
      setReviewBusyId(null);
    }
  }

  async function connectTelegramBusiness(): Promise<void> {
    if (!individualOutreachEnabled || telegramConnectionBusy) return;
    const requestKey = pendingTelegramConnectRequestKey.current
      ?? `lead-radar-telegram-connect-ui-${crypto.randomUUID()}`;
    pendingTelegramConnectRequestKey.current = requestKey;
    setTelegramConnectionBusy(true);
    setTelegramConnectionNotice(null);
    try {
      const next = await api.leadRadarTelegramBusinessConnect(requestKey);
      pendingTelegramConnectRequestKey.current = null;
      const safeUrl = normalizeTelegramBusinessConnectUrl(next.url);
      const expiresAt = Date.parse(next.expiresAt);
      if (!safeUrl
        || !Number.isFinite(expiresAt)
        || expiresAt <= Date.now()
        || expiresAt > Date.now() + 30 * 60_000) {
        setTelegramConnectLink(null);
        setTelegramConnectionNotice('Сервер вернул небезопасную ссылку подключения. Переход заблокирован; сообщите администратору платформы.');
        return;
      }
      setTelegramConnectLink({ ...next, url: safeUrl });
      setTelegramBusinessStatus((current) => ({
        status: 'pending',
        canReply: false,
        connectedAt: current?.connectedAt ?? null,
        activeCompanyChats: 0,
      }));
      telegramStatusPollingDeadline.current = Date.now() + 15 * 60_000;
      setTelegramStatusPollingStopped(false);
      setTelegramConnectionNotice('Ссылка готова. Откройте её, подтвердите подключение в Telegram и вернитесь к этой странице.');
    } catch (connectError) {
      const definiteResponse = typeof (connectError as { status?: unknown })?.status === 'number';
      if (definiteResponse) pendingTelegramConnectRequestKey.current = null;
      setTelegramConnectionNotice(definiteResponse
        ? errorCopy(connectError)
        : 'Ответ сервера о подключении не получен. Повтор использует тот же безопасный ключ и не создаст второе подключение.');
    } finally {
      setTelegramConnectionBusy(false);
    }
  }

  const totals = overview?.totals ?? { searches: 0, leads: 0, p1: 0, telegram: 0, replies: 0, qualified: 0 };
  const totalsUnknown = overviewLoading || (!overview && overviewError);
  const sourceStatuses = overview?.sourceHealth
    .filter((source) => source.source !== 'Открытые реестры')
    .map((source) => source.status) ?? [];
  const sourceBadge = overviewLoading
    ? { label: 'Проверяем источники…', className: 'border-white/[0.1] bg-white/[0.035] text-white/60' }
    : overviewError || sourceStatuses.length === 0
      ? { label: 'Статус источников неизвестен', className: 'border-white/[0.1] bg-white/[0.035] text-white/60' }
    : sourceStatuses.includes('blocked')
      ? { label: 'Источники недоступны', className: 'border-rose-400/25 bg-rose-400/[0.08] text-rose-200' }
      : sourceStatuses.includes('limited')
        ? { label: 'Источники работают частично', className: 'border-amber-300/25 bg-amber-300/[0.07] text-amber-100' }
        : { label: 'Последний запуск получил данные', className: 'border-brand-cyan/25 bg-brand-cyan/[0.07] text-brand-cyan' };

  return (
    <div className="min-h-screen overflow-hidden bg-[#05070d] text-white" data-testid="lead-radar-page">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_78%_5%,rgba(34,158,217,.12),transparent_28%),radial-gradient(circle_at_18%_30%,rgba(110,59,255,.09),transparent_30%)]" />
      <div className="relative mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 xl:p-8">
        <header className="flex flex-col gap-5 border-b border-white/[0.06] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-cyan">
              <Radar size={14} aria-hidden="true" />GPTBot Intelligence
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl lg:text-5xl">
              Lead Radar
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55 sm:text-base">
              Ищет публичные записи о компаниях, связывает факты с источниками и собирает очередь для ручной проверки. Никаких выдуманных контактов и магических процентов.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 ${sourceBadge.className}`}>
              <Activity size={14} aria-hidden="true" />{sourceBadge.label}
            </span>
            <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 text-white/60"><ShieldCheck size={13} aria-hidden="true" />Факты со ссылкой на источник</span>
          </div>
        </header>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-4 text-sm text-rose-100">
            <CircleHelp size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1">{error}</div>
            <button type="button" onClick={() => setError(null)} className="min-h-11 px-2 text-xs text-rose-100/70">Закрыть</button>
          </div>
        )}
        {searchAttemptError && (
          <div role="alert" data-testid="lead-radar-search-attempt-error" className="flex items-start gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-4 text-sm text-rose-100">
            <CircleHelp size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1 leading-6">
              <strong className="block text-white">Поиск «{searchInputLabel(searchAttemptError.input)}» не запущен.</strong>
              <span>{searchAttemptError.message}</span>
              <span className="mt-1 block text-rose-100/75">
                Парсинг не потерян: текущий результат ниже продолжает обновляться. Новый запуск можно повторить после указанной сервером паузы; ограничение может относиться к незавершённым запускам или частоте запросов.
              </span>
              {result && (
                <span className="mt-1 block text-rose-100/75">
                  Ниже по-прежнему открыт предыдущий результат «{searchInputLabel(result.search.input)}».
                </span>
              )}
            </div>
            <button type="button" onClick={() => setSearchAttemptError(null)} className="min-h-11 px-2 text-xs text-rose-100/70">Закрыть</button>
          </div>
        )}
        {reviewNotice && (
          <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.055] p-4 text-sm text-amber-100">
            <CircleHelp size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1">{reviewNotice}</div>
            <button type="button" onClick={() => setReviewNotice(null)} className="min-h-11 px-2 text-xs text-amber-100/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100">Закрыть</button>
          </div>
        )}
        {overviewError && !overview && !result && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-300/20 bg-rose-300/[0.055] p-4 text-sm text-rose-100">
            <CircleHelp size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1"><strong className="text-white">Не удалось загрузить Lead Radar.</strong> Сервер не подтвердил состояние системы. Это не означает, что сохранённые компании удалены. Новые действия недоступны до успешного обновления. {overviewErrorHint}</div>
            <button type="button" onClick={() => { setOverviewLoading(true); void loadOverview(); }} disabled={overviewLoading} className="min-h-11 px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-100">{overviewLoading ? 'Обновляем…' : 'Повторить'}</button>
          </div>
        )}
        {!overviewLoading && !overviewError && !capabilities.admissionEnabled && (
          <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.055] p-4 text-sm text-amber-100">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div><strong className="text-white">Безопасная пауза.</strong> Новые поиски не создаются. Сохранённые результаты доступны только для исследования; контактные действия включаются отдельным разрешением.</div>
          </div>
        )}

        <nav aria-label="Разделы Lead Radar" className="flex flex-wrap gap-3">
          <Button variant={view==='search'?'primary':'secondary'} aria-current={view==='search'?'page':undefined} onClick={()=>changeView('search')}>Поиск компаний</Button>
          <Button variant={view==='contacts'?'primary':'secondary'} aria-current={view==='contacts'?'page':undefined} onClick={()=>changeView('contacts')}>Все Telegram-контакты и кампании</Button>
        </nav>

        {handoff && (
          <div
            role="status"
            data-testid="lead-radar-signal-handoff"
            className="flex flex-wrap items-start gap-3 rounded-2xl border border-brand-cyan/25 bg-brand-cyan/[0.06] p-4"
          >
            <span className="mt-0.5 shrink-0 text-brand-cyan"><Radar size={16} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white/85">Заявка из Signal Radar</p>
              {handoff.quote && (
                <p className="mt-1 text-sm italic leading-relaxed text-white/60">«{handoff.quote}»</p>
              )}
              <p className="mt-1.5 text-xs leading-relaxed text-white/55">
                Оффер и рынок подставились из запроса. Нишу укажите сами: в просьбе
                «нужен бот» нет отрасли, и угадывать её мы не стали.
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={()=>setHandoff(null)} data-testid="lead-radar-signal-handoff-dismiss">
              Скрыть
            </Button>
          </div>
        )}
        {view==='contacts' && <TelegramContactDirectory
          onOpenSearch={(id)=>{changeView('search');void openSearch(id);}}
          initialTemplate={campaignMessageTemplate(draftInput.offer)}
          telegramAccountEnabled={telegramAccountEnabled} telegramAccountReadiness={telegramAccountReadiness}
          campaignOutreachEnabled={campaignOutreachEnabled} campaignAutoSendEnabled={campaignAutoSendEnabled}
          telegramCampaignDailyLimit={telegramCampaignDailyLimit} telegramCampaignMinimumIntervalSeconds={telegramCampaignMinimumIntervalSeconds}
        />}
        <div className={view==='search'?'grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]':'hidden'}>
          <aside className="space-y-6">
            <section aria-labelledby="search-title" className="overflow-hidden rounded-[1.75rem] border border-white/[0.09] bg-[#08111f]/90 shadow-[0_30px_80px_-50px_rgba(34,158,217,.75)]">
              <div className="border-b border-white/[0.07] bg-[linear-gradient(135deg,rgba(34,158,217,.11),rgba(47,230,209,.04))] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-cyan">Новый поиск</p>
                    <h2 id="search-title" className="mt-1 text-lg font-semibold text-white">Опишите идеального клиента</h2>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-xl border border-brand-cyan/20 bg-brand-cyan/[0.07]"><Target size={18} className="text-brand-cyan" aria-hidden="true" /></div>
                </div>
              </div>
              <form className="space-y-4 p-5" aria-busy={loading} onSubmit={(event) => { event.preventDefault(); void runSearch(); }}>
                <div>
                  <Label htmlFor="lead-radar-niche">Ниша</Label>
                  <Input id="lead-radar-niche" disabled={loading || !capabilities.admissionEnabled} value={draftInput.niche} onChange={(event) => setDraftInput({ ...draftInput, niche: event.target.value })} className="min-h-12" placeholder="Например, стоматологии" required />
                  <p className="mt-2 text-[11px] leading-4 text-white/55">Можно писать своими словами или с опечаткой: поиск попробует распознать нишу и показать близкие по смыслу бизнесы.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-1">
                  <div>
                    <Label htmlFor="lead-radar-city">Город</Label>
                    <Input id="lead-radar-city" disabled={loading || !capabilities.admissionEnabled} value={draftInput.city} onChange={(event) => setDraftInput({ ...draftInput, city: event.target.value })} className="min-h-12" required />
                  </div>
                  <div>
                    <Label htmlFor="lead-radar-goal">Цель поиска</Label>
                    <Select id="lead-radar-goal" disabled={loading || !capabilities.admissionEnabled} value={draftInput.searchGoal ?? 'companies'} onChange={(event) => setDraftInput({ ...draftInput, searchGoal: event.target.value as 'companies' | 'telegram_contacts', maxCandidates: event.target.value === 'telegram_contacts' ? 100 : undefined })} className="mb-3 min-h-12">
                      <option value="companies">Найти компании</option>
                      <option value="telegram_contacts">Найти корпоративные Telegram-контакты</option>
                    </Select>
                    <Label htmlFor="lead-radar-count">Количество {draftInput.searchGoal === 'telegram_contacts' ? 'Telegram-контактов' : 'компаний'}</Label>
                    <Select id="lead-radar-count" disabled={loading || !capabilities.admissionEnabled} value={draftInput.desiredCount} onChange={(event) => setDraftInput({ ...draftInput, desiredCount: Number(event.target.value) })} className="min-h-12">
                      {[10, 20, 30, 40, 50].map((count) => <option key={count} value={count}>{count}</option>)}
                    </Select>
                    {draftInput.searchGoal === 'telegram_contacts' && <>
                      <Label htmlFor="lead-radar-candidate-limit">Предел проверки компаний</Label>
                      <Select id="lead-radar-candidate-limit" disabled={loading || !capabilities.admissionEnabled} value={draftInput.maxCandidates ?? 100} onChange={(event) => setDraftInput({ ...draftInput, maxCandidates: Number(event.target.value) })} className="min-h-12">
                        {[50, 100, 150, 250].map((count) => <option key={count} value={count}>{count}</option>)}
                      </Select>
                      <p className="mt-2 text-xs leading-5 text-white/55">Если контактов мало, поиск продолжится по следующим компаниям. Telegram и разрешение на отправку проверяются отдельно.</p>
                    </>}
                  </div>
                </div>
                <div>
                  <Label htmlFor="lead-radar-offer">Что предлагаем</Label>
                  <Textarea id="lead-radar-offer" disabled={loading || !capabilities.admissionEnabled} value={draftInput.offer} onChange={(event) => setDraftInput({ ...draftInput, offer: event.target.value })} className="min-h-20 resize-y" rows={2} required />
                </div>
                <label className={`flex min-h-14 items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 ${!capabilities.admissionEnabled || !telegramDiscoveryEnabled ? 'cursor-not-allowed opacity-65' : 'cursor-pointer'}`}>
                  <span>
                    <span className="block text-sm font-medium text-white/80">Сначала компании с Telegram</span>
                    <span id="lead-radar-telegram-preference-help" className="mt-0.5 block text-xs text-white/60">{loading ? 'Настройка сохранится для следующего запуска; текущий поиск не изменится' : 'Меняет порядок выдачи; компании без Telegram не удаляются'}</span>
                  </span>
                  <input type="checkbox" aria-describedby="lead-radar-telegram-preference-help" disabled={!capabilities.admissionEnabled || !telegramDiscoveryEnabled} checked={draftInput.telegramRequired} onChange={(event) => setDraftInput({ ...draftInput, telegramRequired: event.target.checked })} className="h-5 w-5 accent-[#2fe6d1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan" />
                </label>
                <Button type="submit" size="lg" disabled={loading || !capabilities.admissionEnabled} className="min-h-14 w-full text-sm font-semibold">
                  {pendingSearchInput ? <><LoaderCircle size={18} className="motion-safe:animate-spin" aria-hidden="true" />Запускаем поиск…</> : loading ? <><LoaderCircle size={18} className="motion-safe:animate-spin" aria-hidden="true" />Подождите…</> : !capabilities.admissionEnabled ? <><ShieldCheck size={18} aria-hidden="true" />Поиск приостановлен</> : <><Search size={18} aria-hidden="true" />Найти компании<ArrowRight size={16} aria-hidden="true" /></>}
                </Button>
                {(pendingSearchInput || draftDiffersFromOpenResult) && (
                  <p role="status" data-testid="lead-radar-draft-context" className="rounded-xl border border-brand-cyan/15 bg-brand-cyan/[0.045] px-3 py-2 text-[11px] leading-4 text-white/65">
                    {pendingSearchInput
                      ? result
                        ? `Запускаем «${searchInputLabel(pendingSearchInput)}». До подтверждения ниже остаётся предыдущий результат «${searchInputLabel(result.search.input)}».`
                        : `Запускаем «${searchInputLabel(pendingSearchInput)}». Результат появится после подтверждения запуска.`
                      : `В форме новый черновик. Ниже открыт сохранённый результат «${openResultLabel}»; он не изменится до нового запуска.`}
                  </p>
                )}
                <p className="text-center text-[11px] leading-4 text-white/60">Поиск идёт в фоне, карточки появляются постепенно. Число результатов может быть меньше цели — система не додумывает компании.</p>
              </form>
            </section>

            <SearchHistory searches={overview?.searches ?? []} activeId={result?.search.id} disabled={loading} onOpen={(id) => { void openSearch(id); }} />

            <section aria-labelledby="sources-title" className="rounded-[1.5rem] border border-white/[0.07] bg-white/[0.018] p-4">
              <h2 id="sources-title" className="flex items-center gap-2 text-sm font-semibold text-white"><Database size={15} className="text-brand-cyan" aria-hidden="true" />Источники</h2>
              {overviewError && <p className="mt-2 text-xs leading-5 text-amber-100/80">Статус источников не обновился. {capabilities.admissionEnabled ? 'Показаны последние доступные данные.' : 'Обновите состояние системы перед поиском.'}</p>}
              <div className="mt-3 space-y-3">
                {(overview?.sourceHealth ?? []).map((source) => (
                  <div key={source.source} className="flex items-start gap-3">
                    <Activity size={14} className={`mt-0.5 shrink-0 ${source.status === 'ready' ? 'text-brand-cyan' : source.status === 'blocked' ? 'text-rose-300' : 'text-amber-300'}`} aria-hidden="true" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-white/75">
                        {source.source}
                        <span className="text-[10px] font-normal text-white/65">{source.status === 'ready' ? 'ответил в последнем запуске' : source.status === 'blocked' ? 'последний запуск не ответил' : 'ограниченно'}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] leading-4 text-white/60">{source.note}{source.checkedAt ? ` · ${formatDate(source.checkedAt)}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center text-[11px] text-white/55 underline decoration-white/20 underline-offset-4 hover:text-white">
                © OpenStreetMap contributors · ODbL
              </a>
            </section>
          </aside>

          <div className="min-w-0 space-y-6">
            <section aria-label="Подключение Telegram Business" className="space-y-3">
                {!individualOutreachEnabled ? (
                  <TelegramBusinessConnectionCard
                    status="paused"
                    canReply={false}
                    connectedAt={null}
                    activeCompanyChats={0}
                    onConnect={() => undefined}
                    actionDisabled
                  />
                ) : telegramBusinessStatus ? (
                  <TelegramBusinessConnectionCard
                    status={telegramBusinessStatus.status}
                    canReply={telegramBusinessStatus.canReply}
                    connectedAt={telegramBusinessStatus.connectedAt}
                    activeCompanyChats={telegramBusinessStatus.activeCompanyChats}
                    onConnect={() => { void connectTelegramBusiness(); }}
                    onRetry={() => { void connectTelegramBusiness(); }}
                    actionLoading={telegramConnectionBusy}
                  />
                ) : (
                  <div role="status" aria-live="polite" className="flex min-h-24 items-center gap-3 rounded-[1.5rem] border border-white/[0.08] bg-[#08111f]/80 p-4 text-sm text-white/70">
                    <LoaderCircle size={18} className="shrink-0 text-brand-cyan motion-safe:animate-spin" aria-hidden="true" />
                    Проверяем подключение Telegram Business…
                  </div>
                )}

                {individualOutreachEnabled ? (
                  <div className={`grid gap-3 ${telegramConnectLink ? 'lg:grid-cols-2' : ''}`}>
                  {telegramConnectLink && (
                    <div className="rounded-[1.5rem] border border-brand-cyan/20 bg-brand-cyan/[0.045] p-4">
                      <h2 className="text-sm font-semibold text-white">Подтвердите подключение в Telegram</h2>
                      <p className="mt-2 text-xs leading-5 text-white/65">
                        Переход не отправляет сообщения. Telegram попросит отдельно подтвердить Business-подключение.
                      </p>
                      <a
                        href={telegramConnectLink.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-grad-cta px-4 py-3 text-sm font-semibold text-[#04101a] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                      >
                        <ExternalLink size={17} aria-hidden="true" />Открыть подключение в Telegram
                      </a>
                      <p className="mt-2 text-[11px] leading-4 text-white/65">
                        Ссылка действует до <time dateTime={telegramConnectLink.expiresAt}>{formatDate(telegramConnectLink.expiresAt)}</time>.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col justify-center rounded-[1.5rem] border border-white/[0.07] bg-white/[0.018] p-4">
                    {telegramConnectionNotice && (
                      <p role="status" aria-live="polite" className="mb-3 text-xs leading-5 text-amber-50/80">
                        {telegramConnectionNotice}
                      </p>
                    )}
                    {telegramStatusPollingStopped && telegramBusinessStatus?.status === 'pending' && (
                      <p role="status" className="mb-3 text-xs leading-5 text-white/65">
                        Автоматическая проверка остановлена через 15 минут. Подключение могло завершиться позже — обновите статус вручную.
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={telegramStatusLoading}
                      aria-busy={telegramStatusLoading}
                      onClick={() => { void loadTelegramBusinessStatus(); }}
                      className="min-h-12 w-full"
                    >
                      <RefreshCw size={17} className={telegramStatusLoading ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />
                      {telegramStatusLoading ? 'Обновляем статус…' : 'Обновить статус подключения'}
                    </Button>
                  </div>
                  </div>
                ) : (
                  <p role="status" className="rounded-[1.5rem] border border-amber-300/15 bg-amber-300/[0.045] p-4 text-sm leading-6 text-amber-50/85">
                    Telegram Business подготовлен в интерфейсе, но production-контакты сейчас выключены защитным флагом. Исследование компаний доступно; подключение и отправка не выполняются до отдельного включения контактного режима.
                  </p>
                )}
              </section>

            <section aria-labelledby="lifetime-metrics-title">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 id="lifetime-metrics-title" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">За всё время</h2>
                <span className="text-[11px] text-white/45">Не относится только к открытому запуску</span>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
                <Metric icon={Radar} label="Запусков" value={totalsUnknown ? '—' : totals.searches} />
                <Metric icon={Building2} label="Компаний" value={totalsUnknown ? '—' : totals.leads} />
                <Metric icon={Sparkles} label="P1-сигнал" value={totalsUnknown ? '—' : totals.p1} accent />
                <Metric icon={MessageCircle} label="Telegram одобрен вручную" value={totalsUnknown ? '—' : totals.telegram} accent />
                <Metric icon={UserRoundCheck} label="Ответили" value={totalsUnknown ? '—' : totals.replies} />
                <Metric icon={Check} label="Квалифицированы" value={totalsUnknown ? '—' : totals.qualified} />
              </div>
            </section>

            {!result && !loading && (
              <section className="grid min-h-[32rem] place-items-center overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[radial-gradient(circle_at_50%_40%,rgba(34,158,217,.1),transparent_34%),rgba(8,17,31,.58)] p-6 text-center">
                <div className="max-w-xl">
                  <div className="mx-auto grid h-20 w-20 place-items-center rounded-[1.5rem] border border-brand-cyan/20 bg-brand-cyan/[0.06] shadow-[0_0_70px_-25px_rgba(47,230,209,.8)]">
                    <Radar size={34} className="text-brand-cyan" aria-hidden="true" />
                  </div>
                  <h2 className="mt-6 text-2xl font-semibold tracking-tight text-white">Не база контактов. Радар возможностей.</h2>
                  <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/65">Введите нишу и город. Lead Radar соберёт публичные записи о компаниях, приложит источники и объяснит, почему запись попала в выдачу.</p>
                  <div className="mt-7 grid gap-3 text-left sm:grid-cols-3">
                    {[['01', 'Находит'], ['02', 'Проверяет'], ['03', 'Приоритизирует']].map(([step, label]) => (
                      <div key={step} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><div className="text-[10px] font-semibold tracking-[0.2em] text-brand-cyan">{step}</div><div className="mt-2 text-sm font-medium text-white/75">{label}</div></div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {loading && !result && (
              <section aria-live="polite" className="grid min-h-[28rem] place-items-center rounded-[2rem] border border-white/[0.08] bg-[#08111f]/70 p-6 text-center">
                <div>
                  <div className="relative mx-auto h-24 w-24">
                    <div className="absolute inset-0 rounded-full border border-brand-cyan/20 motion-safe:animate-ping" />
                    <div className="absolute inset-4 rounded-full border border-brand-cyan/30 motion-safe:animate-pulse" />
                    <div className="absolute inset-0 grid place-items-center"><Radar size={28} className="text-brand-cyan" aria-hidden="true" /></div>
                  </div>
                  <h2 className="mt-6 text-xl font-semibold text-white">Сканируем открытые источники</h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-white/65">География → компании → сайты → публичные доказательства. После постановки в очередь результат будет обновляться автоматически.</p>
                </div>
              </section>
            )}

            {result && (
              <>
                <section className="rounded-[1.75rem] border border-white/[0.08] bg-[#08111f]/75 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-white">{result.search.input.niche} · {result.search.input.city}</h2>
                        <Badge tone={STATUS_COPY[result.search.status].tone}>{STATUS_COPY[result.search.status].label}</Badge>
                        {pendingSearchInput ? <Badge tone="neutral">Предыдущий результат</Badge> : loading && <Badge tone="neutral">Обновляем…</Badge>}
                        {result.search.status === 'running' && (
                          <button type="button" disabled={loading || pulseBusy}
                            onClick={() => { void pulseSearch(result.search.id); }}
                            className="min-h-9 rounded-xl border border-brand-cyan/30 px-3 text-xs text-brand-cyan disabled:opacity-50">
                            {pulseBusy ? 'Обрабатываем партию…' : '⚡ Обработать партию сейчас'}
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-white/55">
                        {result.search.status === 'running'
                          ? PHASE_COPY[result.search.phase].detail
                          : result.search.status === 'failed'
                            ? result.leads.length > 0 ? 'Часть найденных компаний сохранена; один из этапов не завершился.' : 'Источник не завершил запуск до получения компаний.'
                            : `Сохранено ${result.search.funnel.candidateCount} компаний · обработано ${result.search.funnel.processedCount} · личных Telegram одобрено ${result.search.funnel.personalTelegramCount}`}
                      </p>
                      {pulseNotice && (
                        <p
                          role={pulseNotice.kind === 'error' ? 'alert' : 'status'}
                          aria-live="polite"
                          className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${pulseNotice.kind === 'error'
                            ? 'border-rose-300/20 bg-rose-300/[0.06] text-rose-100'
                            : 'border-brand-cyan/20 bg-brand-cyan/[0.05] text-brand-cyan'}`}
                        >
                          {pulseNotice.message}
                        </p>
                      )}
                      {result.search.interpretation && (
                        <p data-testid="lead-radar-intent-interpretation" className="mt-2 text-xs leading-5 text-brand-cyan/80">
                          {result.search.interpretation.expanded
                            ? `Запрос распознан как «${result.search.interpretation.canonicalCategory}» — учитываем синонимы, варианты написания и близкие категории.`
                            : 'Точная бизнес-категория не определена — ищем по значимым словам названия без выдуманных совпадений.'}
                        </p>
                      )}
                    </div>
                    {result.leads.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Фильтры выдачи">
                        <Filter size={14} className="text-white/55" aria-hidden="true" />
                        {([
                          { value: 'all', label: 'Все' },
                          { value: 'decision_maker', label: 'Представитель найден' },
                          { value: 'personal_telegram', label: 'Личный Telegram' },
                          { value: 'P1', label: 'P1' },
                        ] as const).map((filter) => {
                          if (!personalContactsEnabled
                            && (filter.value === 'decision_maker' || filter.value === 'personal_telegram')) return null;
                          const countPending = result.search.status === 'running'
                            && filterCounts[filter.value] === 0
                            && (filter.value === 'decision_maker' || filter.value === 'personal_telegram');
                          const countLabel = countPending ? 'ищем' : String(filterCounts[filter.value]);
                          return (
                            <button
                              key={filter.value}
                              type="button"
                              onClick={() => { setLeadFilter(filter.value); setVisibleLeadLimit(20); setMobileDetailOpen(false); }}
                              aria-pressed={leadFilter === filter.value}
                              aria-label={`${filter.label}: ${countLabel}`}
                              disabled={searchTerminal && filterCounts[filter.value] === 0}
                              className={`min-h-11 rounded-full border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:cursor-not-allowed disabled:opacity-40 ${leadFilter === filter.value ? 'border-brand-cyan/30 bg-brand-cyan/[0.09] text-brand-cyan' : 'border-white/[0.08] text-white/70 hover:text-white'}`}
                            >
                              {filter.label} <span className="ml-1 tabular-nums text-current/75">{countPending ? '…' : filterCounts[filter.value]}</span>
                            </button>
                          );
                        })}
                        <button type="button" disabled={loading} onClick={() => { void openSearch(result.search.id, { restartPolling: true }); }} aria-label="Обновить сохранённый статус поиска и возобновить автообновление" className="grid h-11 w-11 place-items-center rounded-full border border-white/[0.08] text-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:cursor-wait disabled:opacity-50"><RefreshCw size={15} className={loading ? 'motion-safe:animate-spin' : ''} aria-hidden="true" /></button>
                      </div>
                    ) : result.search.status === 'running' ? (
                      <Button type="button" variant="secondary" disabled={loading} onClick={() => { void openSearch(result.search.id, { restartPolling: true }); }} className="min-h-11"><RefreshCw size={15} aria-hidden="true" />Обновить статус</Button>
                    ) : null}
                  </div>
                </section>

                {result.leads.length > 0 && (
                  <section aria-label="Выгрузка контактов для рассылки" className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                    <h3 className="text-sm font-semibold text-white">Выгрузить контакты</h3>
                    <p className="mt-1 max-w-prose text-xs text-white/55">
                      Компании с телефоном или Telegram — без повторов и без отказавшихся от связи.
                      CSV для таблицы, vCard — чтобы импортировать сразу в телефонную книгу и писать в WhatsApp или Telegram.
                    </p>
                    <div className="mt-3">
                      <OutreachExport searchId={result.search.id} leads={result.leads} />
                    </div>
                  </section>
                )}

                <CurrentSearchFunnel
                  search={result.search}
                  pollingDelayed={pollingDelayed}
                  pollingStopped={pollingStopped}
                />

                <FirecrawlDiagnostics key={`firecrawl-${result.search.id}`} searchId={result.search.id} companies={result.leads} />

                {view==='search' && <TelegramAccountCampaignPanel
                  key={result.search.id}
                  searchId={result.search.id}
                  leads={result.leads}
                  onContactsUpdated={() => { void openSearch(result.search.id); }}
                  initialTemplate={campaignMessageTemplate(result.search.input.offer)}
                  telegramAccountEnabled={telegramAccountEnabled}
                  telegramAccountReadiness={telegramAccountReadiness}
                  campaignOutreachEnabled={campaignOutreachEnabled}
                  campaignAutoSendEnabled={campaignAutoSendEnabled}
                  telegramCampaignDailyLimit={telegramCampaignDailyLimit}
                  telegramCampaignMinimumIntervalSeconds={telegramCampaignMinimumIntervalSeconds}
                />}

                {noApprovedPersonalTelegram && (
                  <section role="status" className="rounded-[1.5rem] border border-amber-300/18 bg-amber-300/[0.045] p-4 sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="max-w-2xl">
                        <h3 className="text-sm font-semibold text-white">Компании найдены — личный Telegram ещё не одобрен</h3>
                        <p className="mt-1 text-xs leading-5 text-white/65">Сохранено {result.search.funnel.candidateCount} компаний. Их сайты, телефоны и корпоративные каналы доступны ниже. Автоматически найденные профили требуют ручной проверки владельцем.</p>
                      </div>
                      <Button type="button" variant="secondary" onClick={() => { setLeadFilter('all'); setVisibleLeadLimit(20); setMobileDetailOpen(false); }} className="min-h-11 shrink-0">Показать все компании</Button>
                    </div>
                  </section>
                )}

                {result.search.status === 'failed' && failedCopy && result.leads.length === 0 ? (
                  <SearchOutcome
                    danger
                    title={failedCopy.title}
                    body={failedCopy.body}
                    detail={`Код: ${result.search.errorCode ?? 'discovery_failed'} · запуск ${result.search.id.slice(-8)}`}
                    primary={{ label: 'Повторить поиск', onClick: () => { void runSearch(result.search.input); } }}
                    secondary={{ label: 'Изменить параметры', onClick: () => document.getElementById('lead-radar-niche')?.focus() }}
                  />
                ) : result.search.status === 'running' && result.leads.length === 0 ? (
                  <SearchOutcome
                    title="Первые карточки ещё проверяются"
                    body="Поиск уже выполняется. Карточки появятся здесь сразу после сохранения публичных доказательств — новый запуск создавать не нужно."
                    primary={{ label: 'Обновить статус', onClick: () => { void openSearch(result.search.id, { restartPolling: true }); } }}
                  />
                ) : result.leads.length === 0 ? (
                  <SearchOutcome
                    title={result.search.funnel.rawDiscoveredCount > 0 ? 'Кандидаты найдены, но карточки не прошли проверку' : 'В доступных источниках ничего не найдено'}
                    body={result.search.funnel.rawDiscoveredCount > 0 ? 'Сырые кандидаты не стали карточками без достаточных публичных доказательств. Попробуйте уточнить нишу или город.' : 'Попробуйте более широкое название ниши. Этот результат не доказывает отсутствие компаний в городе.'}
                    primary={{ label: 'Изменить запрос', onClick: () => document.getElementById('lead-radar-niche')?.focus() }}
                  />
                ) : visibleLeads.length > 0 ? (
                  <div className="grid min-w-0 gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
                    <section aria-label="Список компаний" className={`${mobileDetailOpen ? 'hidden' : 'space-y-3'} xl:block xl:max-h-[calc(100vh-12rem)] xl:space-y-3 xl:overflow-y-auto xl:pr-1`}>
                      {visibleLeads.slice(0, visibleLeadLimit).map((lead) => <LeadListItem key={lead.id} lead={lead} selected={selectedLead?.id === lead.id} onSelect={() => { setSelectedLeadId(lead.id); setMobileDetailOpen(true); }} />)}
                      {visibleLeads.length > visibleLeadLimit && (
                        <button type="button" onClick={() => setVisibleLeadLimit((current) => current + 20)} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-white/[0.1] px-4 text-sm font-medium text-white/70 hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
                          Показать ещё {Math.min(20, visibleLeads.length - visibleLeadLimit)}
                        </button>
                      )}
                    </section>
                    {selectedLead && (
                      <div className={`${mobileDetailOpen ? 'block' : 'hidden'} min-w-0 xl:block`}>
                        <LeadDetail
                          key={selectedLead.id}
                          lead={selectedLead}
                          offer={result.search.input.offer}
                          contactEnabled={individualOutreachEnabled}
                          canCheckContacts={capabilities.telegramAccountEnabled === true}
                          onContactResolved={() => { void openSearch(result.search.id); }}
                          onWebsiteContactsUpdated={() => refreshCollectedContacts(result.search.id)}
                          onLifecycle={(lifecycle) => { void updateLifecycle(lifecycle); }}
                          onReviewContact={(personId, status) => { void reviewDecisionMaker(personId, status); }}
                          busy={statusBusy}
                          reviewBusyId={reviewBusyId}
                          focusOnMount={mobileDetailOpen}
                          onBack={() => {
                            setMobileDetailOpen(false);
                            window.setTimeout(() => document.getElementById(`lead-list-${selectedLead.id}`)?.focus(), 0);
                          }}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <SearchOutcome
                    title={`Фильтры скрыли ${result.leads.length} компаний`}
                    body={result.search.status === 'running' ? 'Проверка ещё продолжается. Уже найденные компании сохранены — верните всю выдачу или дождитесь обновления.' : 'Выбранный фильтр не совпал ни с одной сохранённой компанией. Верните всю выдачу.'}
                    primary={{ label: 'Сбросить фильтр', onClick: () => { setLeadFilter('all'); setVisibleLeadLimit(20); setMobileDetailOpen(false); } }}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
