import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  LoaderCircle,
  MessageCircle,
  PauseCircle,
  PlayCircle,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  StopCircle,
  Unplug,
  UsersRound,
} from 'lucide-react';
import type { LeadRadarLead } from '../../../shared/lead-radar';
import { api } from '../../lib/api';
import {
  automaticCampaignLeadIds,
  boundCampaignTemplate,
  campaignFromRecovery,
  campaignResumeBlockReason,
  classifyCampaignLeadLocally,
  isCampaignTemplateReady,
  isSelectableCampaignLead,
  isTelegramAccountQrExpired,
  isValidCampaignRecipientAuthorization,
  LEAD_RADAR_CAMPAIGN_MESSAGE_LIMIT,
  LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT,
  safeTelegramQrDataUrl,
  safeTelegramLoginUrl,
  type LeadRadarCampaignContactBasis,
  type LeadRadarCampaignRecipientClassification,
  type LeadRadarTelegramAccountState,
  type LeadRadarTelegramCampaignPreparation,
  type LeadRadarTelegramCampaignMutationResponse,
  type LeadRadarTelegramCampaignReadModel,
  type LeadRadarTelegramCampaignStatus,
} from '../../lib/lead-radar-campaign';
import { Badge, Button, Card, Input, Label, Select, Textarea } from '../ui';

export interface TelegramAccountCampaignPanelProps {
  searchId: string;
  leads: LeadRadarLead[];
  initialTemplate: string;
  telegramAccountEnabled: boolean;
  campaignOutreachEnabled: boolean;
  campaignAutoSendEnabled: boolean;
}

const ACCOUNT_STATUS_COPY = {
  unconfigured: { label: 'Нужна серверная настройка', tone: 'warning' as const, detail: 'MTProto-шлюз и защищённое хранилище сессии ещё не настроены. Подключение закрыто.' },
  disconnected: { label: 'Не подключён', tone: 'neutral' as const, detail: 'Подключите выделенный аккаунт. Подключение само по себе не запускает кампанию.' },
  pending: { label: 'Ожидает QR', tone: 'warning' as const, detail: 'Отсканируйте короткоживущий QR в Telegram и дождитесь подтверждения сервера.' },
  connecting: { label: 'Ожидает QR', tone: 'warning' as const, detail: 'Отсканируйте короткоживущий QR в Telegram и дождитесь подтверждения сервера.' },
  connected: { label: 'Подключён', tone: 'success' as const, detail: 'Аккаунт готов. Перед каждой отправкой сервер повторно проверяет его состояние.' },
  restricted: { label: 'Ограничен Telegram', tone: 'danger' as const, detail: 'Новые отправки остановлены из-за ограничения аккаунта.' },
  reauth_required: { label: 'Нужно переподключение', tone: 'warning' as const, detail: 'Сессия больше не действует. Подключите аккаунт заново.' },
  revoked: { label: 'Доступ отозван', tone: 'danger' as const, detail: 'Telegram отозвал сессию. Кампании не запускаются.' },
  paused: { label: 'На паузе', tone: 'warning' as const, detail: 'Аккаунт сохранён, но новые отправки остановлены защитным переключателем.' },
  error: { label: 'Статус неизвестен', tone: 'danger' as const, detail: 'Сервер не подтвердил состояние аккаунта. Отправка остаётся закрытой.' },
} as const;

const CAMPAIGN_STATUS_COPY: Record<LeadRadarTelegramCampaignStatus, {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  detail: string;
}> = {
  draft: { label: 'Черновик', tone: 'neutral', detail: 'Кампания создана, но точное подтверждение ещё не принято.' },
  approved: { label: 'Готова к запуску', tone: 'info', detail: 'Состав и текст зафиксированы сервером. Отправка ещё не началась.' },
  running: { label: 'Выполняется', tone: 'info', detail: 'Сервер последовательно обрабатывает адресатов. Это не одномоментная отправка.' },
  paused: { label: 'Пауза', tone: 'warning', detail: 'Новые адресаты не резервируются до продолжения кампании.' },
  stopped: { label: 'Остановлена', tone: 'warning', detail: 'Кампания завершена оператором; неотправленные адресаты отменены.' },
  completed: { label: 'Завершена', tone: 'success', detail: 'Сервер завершил обработку всех адресатов.' },
  failed: { label: 'Ошибка', tone: 'danger', detail: 'Кампания остановлена сервером. Повторный запуск не выполняется автоматически.' },
};

const LOCAL_CLASSIFICATION_COPY: Record<LeadRadarCampaignRecipientClassification, {
  label: string;
  tone: 'success' | 'warning' | 'neutral';
}> = {
  automatic: { label: 'Кандидат на авто', tone: 'success' },
  manual: { label: 'Нужна проверка', tone: 'warning' },
  excluded: { label: 'Будет исключён', tone: 'neutral' },
};

const LOCAL_REASON_COPY = {
  candidate_verified_corporate: 'Найден проверенный корпоративный Telegram. Сервер всё равно повторит проверку.',
  manual_personal_or_unknown: 'Контакт похож на личный или его тип не подтверждён — автоматическая отправка запрещена.',
  missing_telegram: 'У компании не найден Telegram-контакт.',
  unsupported_telegram_type: 'Бот, канал или группа не поддерживаются для личного обращения.',
  do_not_contact: 'Компания находится в списке «Не связываться».',
} as const;

const SERVER_REASON_COPY: Record<string, string> = {
  verified_corporate_endpoint: 'Корпоративный Telegram подтверждён, но отдельная запись основания ещё нужна.',
  verified_corporate_authorized: 'Корпоративный Telegram и отдельная запись основания подтверждены сервером.',
  documented_basis_required: 'Для этой компании нет действующей записи документированного основания.',
  documented_contact_basis_missing: 'Нет подтверждённого основания именно для этой компании.',
  contact_basis_expired: 'Срок подтверждённого основания истёк.',
  personal_contact_manual_only: 'Личный или неподтверждённый контакт — только ручная проверка.',
  bot_not_messageable: 'Бот нельзя использовать как адресата кампании.',
  channel_not_messageable: 'Канал нельзя использовать как адресата личного сообщения.',
  group_not_messageable: 'Группу нельзя использовать как адресата личного сообщения.',
  no_verified_corporate_endpoint: 'Проверенный корпоративный Telegram не найден.',
  corporate_endpoint_unverified: 'Корпоративный Telegram найден, но доказательств недостаточно.',
  do_not_contact: 'Компания находится в списке «Не связываться».',
  company_not_found: 'Компания больше не доступна в этой выдаче.',
};

const RESUME_BLOCK_COPY = {
  cooldown: 'Telegram назначил защитную паузу. Продолжение станет доступно после указанного времени и обновления статуса.',
  review_required: 'Нужна ручная проверка причины паузы. Обновите статус и подтвердите решение перед продолжением.',
  ambiguous_delivery: 'Есть сообщения с неизвестным итогом. Сначала вручную проверьте соответствующие чаты.',
  account_restricted: 'Telegram-аккаунт ограничен или требует проверки. Автоматическое продолжение запрещено.',
  account_disconnected: 'Подключённый Telegram-аккаунт недоступен. Переподключите и проверьте его.',
  campaign_disabled: 'Автоматическая отправка выключена защитным переключателем.',
  identity_confirmation_required: 'Подтвердите, что на карточке указан нужный Telegram-аккаунт.',
} as const;

const CONTACT_BASIS_COPY: Record<LeadRadarCampaignContactBasis, string> = {
  documented_consent: 'Документированное согласие',
  inbound_request: 'Компания сама запросила контакт',
  existing_relationship: 'Существующие деловые отношения',
  contractual_relationship: 'Действующий договор',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(parsed);
}

function localDateTimeInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function localDateTimeToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function campaignErrorCopy(error: unknown): string {
  const details = error as Error & { code?: string; status?: number; retryAfterSeconds?: number };
  if (details.code === 'telegram_campaign_disabled'
    || details.code === 'lead_radar_campaign_paused'
    || details.code === 'lead_radar_campaign_autosend_paused') {
    return 'Кампании выключены защитным переключателем. Ничего не отправлено.';
  }
  if (details.code === 'telegram_campaign_not_configured') return 'Контур отдельного Telegram-аккаунта ещё не настроен. Ничего не отправлено.';
  if (details.code === 'telegram_account_not_connected' || details.code === 'telegram_campaign_account_not_connected') return 'Сначала подключите отдельный Telegram-аккаунт.';
  if (details.code === 'telegram_account_restricted') return 'Telegram ограничил аккаунт. Кампания не запущена.';
  if (details.code === 'telegram_campaign_approval_required'
    || details.code === 'telegram_campaign_approval_expired'
    || details.code === 'telegram_campaign_approval_expired_or_used') {
    return 'Проверка состава или текста устарела. Подготовьте кампанию заново.';
  }
  if (details.code === 'telegram_campaign_no_eligible_recipients') return 'Сервер не подтвердил ни одного корпоративного Telegram-адресата. Кампания не создана.';
  if (details.code === 'telegram_campaign_active_exists') return 'Для этой выдачи уже есть незавершённая кампания. Её статус восстановлен с сервера; второй запуск заблокирован.';
  if (details.code === 'telegram_campaign_eligibility_required') return 'Для выбранных компаний нет действующего подтверждённого основания. Автоматическая отправка заблокирована.';
  if (details.code === 'telegram_campaign_resume_cooldown') return RESUME_BLOCK_COPY.cooldown;
  if (details.code === 'telegram_campaign_resume_review_required') return RESUME_BLOCK_COPY.review_required;
  if (details.code === 'telegram_campaign_resume_ambiguous_delivery') return RESUME_BLOCK_COPY.ambiguous_delivery;
  if (details.code === 'telegram_campaign_resume_account_restricted') return RESUME_BLOCK_COPY.account_restricted;
  if (details.code === 'telegram_campaign_resume_account_disconnected') return RESUME_BLOCK_COPY.account_disconnected;
  if (details.code === 'telegram_campaign_transition_invalid') return 'Этот переход сейчас запрещён. Обновите кампанию и проверьте указанную причину паузы.';
  if (details.code === 'telegram_campaign_invalid_input') return 'Проверьте список, основание и текст кампании. Ничего не отправлено.';
  if (details.code === 'telegram_campaign_idempotency_conflict') return 'Безопасный ключ уже относится к другой операции. Обновите статус кампании.';
  if (details.code === 'telegram_campaign_rate_limited') {
    const retry = details.retryAfterSeconds ? ` Повторите не раньше чем через ${details.retryAfterSeconds} сек.` : '';
    return `Telegram потребовал паузу. Новые отправки остановлены.${retry}`;
  }
  if (details.code === 'telegram_campaign_recipient_limit') return 'В одной кампании можно выбрать не более 50 компаний.';
  if (details.code === 'lead_radar_contact_paused') return 'Контактный контур выключен. Кампания не запущена.';
  if (details.code === 'UNAUTHENTICATED') return 'Сессия завершилась. Войдите в панель снова.';
  if (details.status === 404 || details.status === 503) return 'Контур отдельного Telegram-аккаунта пока недоступен на сервере. Ничего не отправлено.';
  return 'Сервер не подтвердил операцию. Ничего не повторяется автоматически — обновите статус перед новой попыткой.';
}

function hasDefiniteHttpResponse(error: unknown): boolean {
  return typeof (error as { status?: unknown })?.status === 'number';
}

function isCampaignTerminal(status: LeadRadarTelegramCampaignStatus): boolean {
  return status === 'stopped' || status === 'completed' || status === 'failed';
}

function validCampaignReadModel(value: LeadRadarTelegramCampaignReadModel): boolean {
  const counts = value?.counts;
  return Boolean(
    value?.id
    && CAMPAIGN_STATUS_COPY[value.status]
    && counts
    && [counts.total, counts.pending, counts.sent, counts.failed, counts.ambiguous, counts.skipped]
      .every((count) => Number.isInteger(count) && count >= 0),
  );
}

function campaignFromMutation(
  value: LeadRadarTelegramCampaignMutationResponse,
): LeadRadarTelegramCampaignReadModel {
  return 'campaign' in value ? value.campaign : value;
}

function preparationSummary(
  value: LeadRadarTelegramCampaignPreparation | null | undefined,
) {
  return value?.selection ?? value?.summary ?? null;
}

function validPreparation(value: LeadRadarTelegramCampaignPreparation): boolean {
  const expiry = Date.parse(value?.expiresAt);
  const summary = preparationSummary(value);
  return Boolean(
    value?.approvalToken
    && value.selectionDigest
    && value.contentDigest
    && Number.isFinite(expiry)
    && expiry > Date.now()
    && summary
    && summary.selected > 0
    && summary.selected <= LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT,
  );
}

export function TelegramAccountCampaignPanel({
  searchId,
  leads,
  initialTemplate,
  telegramAccountEnabled,
  campaignOutreachEnabled,
  campaignAutoSendEnabled,
}: TelegramAccountCampaignPanelProps) {
  const headingId = useId();
  const composerHelpId = useId();
  const resumeHelpId = useId();
  const connectButtonId = useId();
  const disconnectButtonId = useId();
  const stopButtonId = useId();
  const campaignStateHeadingId = useId();
  const [account, setAccount] = useState<LeadRadarTelegramAccountState | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountClock, setAccountClock] = useState(() => Date.now());
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const [accountIdentityConfirmed, setAccountIdentityConfirmed] = useState(false);
  const [disconnectConfirmation, setDisconnectConfirmation] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(() => new Set());
  const [template, setTemplate] = useState(() => boundCampaignTemplate(initialTemplate));
  const [contactBasis, setContactBasis] = useState<LeadRadarCampaignContactBasis | ''>('');
  const [authorizationLeadId, setAuthorizationLeadId] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [evidenceExpiresAt, setEvidenceExpiresAt] = useState('');
  const [evidenceAttested, setEvidenceAttested] = useState(false);
  const [authorizationBusy, setAuthorizationBusy] = useState(false);
  const [authorizationNotice, setAuthorizationNotice] = useState<string | null>(null);
  const [authorizationError, setAuthorizationError] = useState(false);
  const [authorizedLeadIds, setAuthorizedLeadIds] = useState<Set<string>>(() => new Set());
  const [preparation, setPreparation] = useState<LeadRadarTelegramCampaignPreparation | null>(null);
  const [preparationClock, setPreparationClock] = useState(() => Date.now());
  const [exactConfirmation, setExactConfirmation] = useState(false);
  const [campaign, setCampaign] = useState<LeadRadarTelegramCampaignReadModel | null>(null);
  const [campaignRecovering, setCampaignRecovering] = useState(false);
  const [recoveredSearchId, setRecoveredSearchId] = useState<string | null>(null);
  const [campaignRecoveryIssue, setCampaignRecoveryIssue] = useState<string | null>(null);
  const [campaignClock, setCampaignClock] = useState(() => Date.now());
  const [operationBusy, setOperationBusy] = useState(false);
  const [operationNotice, setOperationNotice] = useState<string | null>(null);
  const [operationError, setOperationError] = useState(false);
  const [stopConfirmation, setStopConfirmation] = useState(false);
  const reviewHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const disconnectConfirmationRef = useRef<HTMLDivElement | null>(null);
  const stopConfirmationRef = useRef<HTMLDivElement | null>(null);
  const connectRequestKey = useRef<string | null>(null);
  const disconnectRequestKey = useRef<string | null>(null);
  const prepareRequestKey = useRef<string | null>(null);
  const createRequestKey = useRef<string | null>(null);
  const authorizationRequest = useRef<{ fingerprint: string; key: string } | null>(null);
  const transitionRequestKeys = useRef<Partial<Record<'start' | 'pause' | 'resume' | 'stop', string>>>({});
  const recoveryRequestSequence = useRef(0);

  const loadAccount = useCallback(async (): Promise<LeadRadarTelegramAccountState | null> => {
    if (!telegramAccountEnabled) return null;
    setAccountLoading(true);
    try {
      const next = await api.leadRadarTelegramAccount();
      setAccountClock(Date.now());
      setAccount(next);
      setAccountNotice(null);
      return next;
    } catch (statusError) {
      setAccount((current) => current ?? {
        status: 'error',
        connectionId: null,
        displayName: null,
        username: null,
        phoneMasked: null,
        connectedAt: null,
        lastHealthAt: null,
        qr: null,
        reasonCode: null,
      });
      setAccountNotice(campaignErrorCopy(statusError));
      return null;
    } finally {
      setAccountLoading(false);
    }
  }, [telegramAccountEnabled]);

  const recoverCampaign = useCallback(async (): Promise<LeadRadarTelegramCampaignReadModel | null> => {
    if (!telegramAccountEnabled) return null;
    const requestSequence = ++recoveryRequestSequence.current;
    setCampaignRecovering(true);
    setCampaignRecoveryIssue(null);
    try {
      const response = await api.leadRadarTelegramCampaignRecovery(searchId);
      if (requestSequence !== recoveryRequestSequence.current) return null;
      const recovered = campaignFromRecovery(response);
      if (recovered && !validCampaignReadModel(recovered)) {
        throw Object.assign(new Error('Invalid campaign recovery response'), { status: 502 });
      }
      setCampaignClock(Date.now());
      setCampaign(recovered);
      setRecoveredSearchId(searchId);
      setOperationError(false);
      setOperationNotice(recovered
        ? isCampaignTerminal(recovered.status)
          ? 'Показана последняя кампания этой выдачи. Её можно закрыть и подготовить новую.'
          : 'Активная кампания восстановлена с сервера. Локальные повторы не запускались.'
        : null);
      return recovered;
    } catch (recoveryError: unknown) {
      if (requestSequence !== recoveryRequestSequence.current) return null;
      const status = (recoveryError as { status?: number })?.status;
      if (status === 404) {
        setCampaign(null);
        setRecoveredSearchId(searchId);
        setCampaignRecoveryIssue(null);
        return null;
      }
      setCampaign(null);
      setRecoveredSearchId(null);
      setCampaignRecoveryIssue(campaignErrorCopy(recoveryError));
      return null;
    } finally {
      if (requestSequence === recoveryRequestSequence.current) setCampaignRecovering(false);
    }
  }, [searchId, telegramAccountEnabled]);

  useEffect(() => {
    if (!telegramAccountEnabled) {
      setAccount(null);
      setAccountNotice(null);
      return;
    }
    void loadAccount();
  }, [telegramAccountEnabled, loadAccount]);

  useEffect(() => {
    const authId = account?.status === 'connecting' || account?.status === 'pending'
      ? account?.qr?.authId
      : null;
    if (!telegramAccountEnabled || !authId) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    const challengeExpiresAt = Date.parse(account?.qr?.expiresAt ?? '');
    const deadline = Number.isFinite(challengeExpiresAt)
      ? Math.min(Date.now() + 15 * 60_000, challengeExpiresAt)
      : Date.now();
    const poll = async (): Promise<void> => {
      if (Date.now() >= deadline) {
        setAccountClock(Date.now());
        setAccountNotice('Срок QR истёк. Создайте новый QR; сообщения не отправлялись.');
        return;
      }
      try {
        const next = await api.leadRadarTelegramAccountConnectStatus(authId);
        if (cancelled) return;
        setAccountClock(Date.now());
        setAccount(next);
        setAccountNotice(null);
        if (next.status !== 'connecting' && next.status !== 'pending') return;
      } catch (pollError) {
        if (cancelled) return;
        setAccountNotice(campaignErrorCopy(pollError));
      }
      const remaining = Math.max(0, deadline - Date.now() + 50);
      timer = window.setTimeout(() => { void poll(); }, Math.min(5_000, remaining));
    };
    const firstDelay = Math.max(0, deadline - Date.now() + 50);
    timer = window.setTimeout(() => { void poll(); }, Math.min(3_000, firstDelay));
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [account?.qr?.authId, account?.qr?.expiresAt, account?.status, telegramAccountEnabled]);

  useEffect(() => {
    if (!campaign || campaign.status !== 'running') return undefined;
    let cancelled = false;
    let timer: number | undefined;
    let consecutiveErrors = 0;
    const poll = async (): Promise<void> => {
      try {
        const next = await api.leadRadarTelegramCampaign(campaign.id);
        if (cancelled) return;
        if (!validCampaignReadModel(next)) throw new Error('Invalid campaign read model');
        setCampaignClock(Date.now());
        setCampaign(next);
        setOperationNotice(null);
        setOperationError(false);
        consecutiveErrors = 0;
        if (next.status !== 'running') return;
      } catch (pollError) {
        if (cancelled) return;
        consecutiveErrors += 1;
        setOperationNotice(campaignErrorCopy(pollError));
        setOperationError(true);
      }
      const delay = Math.min(30_000, 5_000 * (2 ** Math.min(consecutiveErrors, 2)));
      timer = window.setTimeout(() => { void poll(); }, delay);
    };
    timer = window.setTimeout(() => { void poll(); }, 4_000);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [campaign]);

  useEffect(() => {
    setSelectedLeadIds(new Set());
    setPreparation(null);
    setExactConfirmation(false);
    setCampaign(null);
    setRecoveredSearchId(null);
    setCampaignRecoveryIssue(null);
    setAuthorizationLeadId('');
    setEvidenceReference('');
    setEvidenceExpiresAt('');
    setEvidenceAttested(false);
    setAuthorizationNotice(null);
    setAuthorizationError(false);
    setAuthorizedLeadIds(new Set());
    setOperationNotice(null);
    setOperationError(false);
    prepareRequestKey.current = null;
    createRequestKey.current = null;
    authorizationRequest.current = null;
    transitionRequestKeys.current = {};
  }, [searchId]);

  useEffect(() => {
    if (!telegramAccountEnabled) {
      recoveryRequestSequence.current += 1;
      setCampaignRecovering(false);
      setRecoveredSearchId(null);
      setCampaignRecoveryIssue(null);
      return undefined;
    }
    void recoverCampaign();
    return () => { recoveryRequestSequence.current += 1; };
  }, [recoverCampaign, telegramAccountEnabled]);

  useEffect(() => {
    if (!preparation || campaign) return undefined;
    const expiresAt = Date.parse(preparation.expiresAt);
    if (!Number.isFinite(expiresAt)) return undefined;
    const timer = window.setTimeout(() => {
      setPreparationClock(Date.now());
      setExactConfirmation(false);
      setOperationError(true);
      setOperationNotice('Срок серверной проверки истёк. Список и текст нужно проверить заново; ничего не отправлено.');
    }, Math.max(0, expiresAt - Date.now() + 50));
    return () => window.clearTimeout(timer);
  }, [campaign, preparation]);

  useEffect(() => {
    if (!preparation || campaign) return;
    reviewHeadingRef.current?.focus();
  }, [campaign, preparation]);

  useEffect(() => {
    if (campaign?.status !== 'paused') return undefined;
    const resumeAt = Date.parse(campaign.pausedUntil ?? campaign.nextSendAt ?? '');
    if (!Number.isFinite(resumeAt) || resumeAt <= campaignClock) return undefined;
    const timer = window.setTimeout(
      () => setCampaignClock(Date.now()),
      Math.min(2_147_000_000, Math.max(0, resumeAt - Date.now() + 50)),
    );
    return () => window.clearTimeout(timer);
  }, [campaign, campaignClock]);

  const leadIdsSignature = leads.map((lead) => lead.id).join('\u0000');
  useEffect(() => {
    const available = new Set(leadIdsSignature ? leadIdsSignature.split('\u0000') : []);
    const next = new Set([...selectedLeadIds].filter((id) => available.has(id)));
    if (next.size === selectedLeadIds.size) return;
    setSelectedLeadIds(next);
    setPreparation(null);
    setExactConfirmation(false);
    setOperationNotice('Состав найденных компаний изменился; серверную проверку нужно выполнить заново.');
    setOperationError(false);
    prepareRequestKey.current = null;
    createRequestKey.current = null;
  }, [leadIdsSignature, selectedLeadIds]);

  const selectedLeads = useMemo(() => leads.filter((lead) => selectedLeadIds.has(lead.id)), [leads, selectedLeadIds]);
  const selectedCorporateCandidates = useMemo(
    () => selectedLeads.filter((lead) => classifyCampaignLeadLocally(lead).classification === 'automatic'),
    [selectedLeads],
  );
  const authorizationLead = selectedCorporateCandidates
    .find((lead) => lead.id === authorizationLeadId) ?? null;
  const authorizationExpiryIso = localDateTimeToIso(evidenceExpiresAt);
  const authorizationNow = Date.now();
  const campaignRecoveryReady = !telegramAccountEnabled
    || !campaignOutreachEnabled
    || (recoveredSearchId === searchId && !campaignRecovering && !campaignRecoveryIssue);
  const authorizationExpiresTime = Date.parse(authorizationExpiryIso ?? '');
  const evidenceReferenceReady = evidenceReference.trim().length >= 8
    && evidenceReference.trim().length <= 200
    && ![...evidenceReference].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    });
  const evidenceExpiryReady = Number.isFinite(authorizationExpiresTime)
    && authorizationExpiresTime > authorizationNow
    && authorizationExpiresTime <= authorizationNow + 366 * 24 * 60 * 60_000;
  const authorizationFormReady = Boolean(
    campaignOutreachEnabled
    && campaignRecoveryReady
    && contactBasis
    && authorizationLead
    && evidenceReferenceReady
    && evidenceExpiryReady
    && evidenceAttested
    && !authorizationBusy,
  );
  const authorizationMin = localDateTimeInputValue(new Date(authorizationNow + 5 * 60_000));
  const authorizationMax = localDateTimeInputValue(new Date(authorizationNow + 366 * 24 * 60 * 60_000));
  const localSummary = useMemo(() => selectedLeads.reduce((summary, lead) => {
    const classification = classifyCampaignLeadLocally(lead).classification;
    summary[classification] += 1;
    return summary;
  }, { automatic: 0, manual: 0, excluded: 0 }), [selectedLeads]);
  const automaticLeadIds = useMemo(() => automaticCampaignLeadIds(leads), [leads]);
  const automaticLeadCount = automaticLeadIds.length;
  const accountConnectionId = account?.connectionId ?? account?.id ?? null;
  const connected = account?.status === 'connected' && Boolean(accountConnectionId);
  const accountIdentityLabel = account?.displayName
    || account?.maskedLabel
    || (account?.username ? `@${account.username.replace(/^@/, '')}` : null)
    || account?.phoneMasked
    || null;
  const accountIdentityAvailable = connected && Boolean(accountIdentityLabel);
  const accountIdentityKey = `${accountConnectionId ?? ''}:${account?.stateVersion ?? ''}:${accountIdentityLabel ?? ''}`;
  const qrExpired = isTelegramAccountQrExpired(account, accountClock);
  const safeQr = qrExpired ? null : safeTelegramQrDataUrl(account?.qr?.qrCodeDataUrl);
  const safeQrLoginUrl = qrExpired ? null : safeTelegramLoginUrl(account?.qr?.qrLoginUrl);
  const serverSummary = preparationSummary(preparation);
  const preparationExpired = preparation ? Date.parse(preparation.expiresAt) <= preparationClock : false;
  const reviewRecipients = useMemo(() => {
    if (!preparation) return [];
    if (preparation.recipients?.length) {
      return preparation.recipients.map((recipient) => ({
        leadId: recipient.leadId,
        companyName: recipient.companyName,
        classification: recipient.classification,
        reasonCode: recipient.reasonCode,
        preview: recipient.preview,
        authorization: recipient.authorization ?? null,
      }));
    }
    return (preparation.selection?.items ?? []).map((recipient) => ({
      leadId: recipient.companyId,
      companyName: recipient.name ?? 'Компания',
      classification: recipient.classification,
      reasonCode: recipient.reasonCode,
      preview: null,
      authorization: recipient.authorization ?? null,
    }));
  }, [preparation]);
  const previewItems = useMemo(() => {
    if (!preparation) return [];
    const previewByLead = new Map((preparation.previews ?? [])
      .map((preview) => [preview.leadId, preview] as const));
    const automaticRecipients = reviewRecipients
      .filter((recipient) => recipient.classification === 'automatic');
    if (automaticRecipients.length > 0) {
      return automaticRecipients.map((recipient) => ({
        leadId: recipient.leadId,
        companyName: recipient.companyName,
        text: recipient.preview ?? previewByLead.get(recipient.leadId)?.text ?? null,
        authorization: recipient.authorization,
      }));
    }
    return (preparation.previews ?? []).map((preview) => ({
      ...preview,
      text: preview.text ?? null,
      authorization: null,
    }));
  }, [preparation, reviewRecipients]);
  const nonAutomaticReviewItems = reviewRecipients
    .filter((recipient) => recipient.classification !== 'automatic');
  const previewComplete = Boolean(
    serverSummary
    && serverSummary.automatic > 0
    && previewItems.length === serverSummary.automatic
    && new Set(previewItems.map((preview) => preview.leadId)).size === previewItems.length
    && previewItems.every((preview) => typeof preview.text === 'string' && preview.text.trim().length > 0),
  );
  const authorizationComplete = Boolean(
    previewComplete
    && contactBasis
    && previewItems.every((preview) => isValidCampaignRecipientAuthorization(
      preview.authorization,
      contactBasis,
      preparationClock,
    )),
  );
  const authorizedRecipientCount = contactBasis
    ? previewItems.filter((preview) => isValidCampaignRecipientAuthorization(
      preview.authorization,
      contactBasis,
      preparationClock,
    )).length
    : 0;
  const reviewComplete = previewComplete && authorizationComplete;
  const templateIssue = isCampaignTemplateReady(template)
    ? null
    : template.trim().length === 0
      ? 'Введите текст сообщения.'
      : 'Используйте только переменную {company_name} и не превышайте 4096 символов.';
  const resumeBlock = campaign
    ? campaignResumeBlockReason({
      campaign,
      account,
      autoSendEnabled: campaignAutoSendEnabled,
      identityConfirmed: accountIdentityConfirmed,
      now: campaignClock,
    })
    : null;
  const createReady = Boolean(
    campaignOutreachEnabled
    && campaignRecoveryReady
    && connected
    && accountIdentityAvailable
    && accountIdentityConfirmed
    && !account?.identityReviewRequired
    && contactBasis
    && preparation
    && !preparationExpired
    && serverSummary
    && serverSummary.automatic > 0
    && reviewComplete
    && exactConfirmation
    && !operationBusy,
  );

  useEffect(() => {
    setAccountIdentityConfirmed(false);
    setPreparation(null);
    setExactConfirmation(false);
    prepareRequestKey.current = null;
    createRequestKey.current = null;
  }, [accountIdentityKey]);

  const authorizationCandidateSignature = selectedCorporateCandidates.map((lead) => lead.id).join('\u0000');
  useEffect(() => {
    const available = authorizationCandidateSignature
      ? authorizationCandidateSignature.split('\u0000')
      : [];
    if (authorizationLeadId && available.includes(authorizationLeadId)) return;
    setAuthorizationLeadId(available[0] ?? '');
    setEvidenceReference('');
    setEvidenceExpiresAt('');
    setEvidenceAttested(false);
    setAuthorizationNotice(null);
    setAuthorizationError(false);
    authorizationRequest.current = null;
  }, [authorizationCandidateSignature, authorizationLeadId]);

  useEffect(() => {
    if (disconnectConfirmation) disconnectConfirmationRef.current?.focus();
  }, [disconnectConfirmation]);

  useEffect(() => {
    if (stopConfirmation) stopConfirmationRef.current?.focus();
  }, [stopConfirmation]);

  function invalidatePreparation(): void {
    setPreparation(null);
    setExactConfirmation(false);
    setOperationNotice(null);
    setOperationError(false);
    prepareRequestKey.current = null;
    createRequestKey.current = null;
  }

  function restoreFocus(elementId: string): void {
    window.requestAnimationFrame(() => document.getElementById(elementId)?.focus());
  }

  function toggleLead(lead: LeadRadarLead): void {
    if (!isSelectableCampaignLead(lead) || operationBusy || campaign) return;
    const next = new Set(selectedLeadIds);
    if (next.has(lead.id)) {
      next.delete(lead.id);
    } else if (next.size < LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT) {
      next.add(lead.id);
    } else {
      setOperationError(true);
      setOperationNotice('В одной кампании можно выбрать не более 50 компаний.');
      return;
    }
    setSelectedLeadIds(next);
    invalidatePreparation();
  }

  function selectAllEligible(): void {
    if (operationBusy || campaign) return;
    setSelectedLeadIds(new Set(automaticLeadIds.slice(0, LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT)));
    invalidatePreparation();
    if (automaticLeadIds.length > LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT) {
      setOperationError(false);
      setOperationNotice(`Выбраны первые 50 из ${automaticLeadIds.length} предварительно подходящих компаний. Остальные сохранены в выдаче.`);
    } else if (automaticLeadIds.length > 0) {
      setOperationError(false);
      setOperationNotice(`Выбраны ${automaticLeadIds.length} предварительно подходящих компаний. Финальное решение примет сервер.`);
    }
  }

  function updateTemplate(value: string): void {
    if (operationBusy || campaign) return;
    setTemplate(boundCampaignTemplate(value));
    invalidatePreparation();
  }

  async function connectAccount(): Promise<void> {
    if (!telegramAccountEnabled || accountBusy) return;
    const requestKey = connectRequestKey.current ?? `lead-radar-account-connect-ui-${crypto.randomUUID()}`;
    connectRequestKey.current = requestKey;
    setAccountBusy(true);
    setAccountNotice(null);
    try {
      const next = await api.leadRadarConnectTelegramAccount(requestKey);
      connectRequestKey.current = null;
      setAccountClock(Date.now());
      setAccount(next);
      setAccountNotice(next.status === 'connected'
        ? 'Telegram подтвердил подключение выделенного аккаунта.'
        : 'QR создан. Отсканируйте его в Telegram; сообщения ещё не отправляются.');
    } catch (connectError) {
      if (hasDefiniteHttpResponse(connectError)) connectRequestKey.current = null;
      setAccountNotice(campaignErrorCopy(connectError));
    } finally {
      setAccountBusy(false);
    }
  }

  async function refreshConnectionStatus(): Promise<void> {
    const authId = account?.qr?.authId;
    if (!authId || accountLoading || accountBusy) return;
    setAccountLoading(true);
    setAccountNotice(null);
    try {
      const next = await api.leadRadarTelegramAccountConnectStatus(authId);
      setAccountClock(Date.now());
      setAccount(next);
      setAccountNotice(next.status === 'connected'
        ? 'Telegram подтвердил подключение. Сверьте карточку аккаунта перед кампанией.'
        : 'Telegram ещё не подтвердил вход. QR остаётся активным; сообщения не отправляются.');
    } catch (statusError) {
      setAccountNotice(campaignErrorCopy(statusError));
    } finally {
      setAccountLoading(false);
    }
  }

  async function disconnectAccount(): Promise<void> {
    if (accountBusy || !disconnectConfirmation) return;
    const requestKey = disconnectRequestKey.current ?? `lead-radar-account-disconnect-ui-${crypto.randomUUID()}`;
    disconnectRequestKey.current = requestKey;
    setAccountBusy(true);
    setAccountNotice(null);
    try {
      const next = await api.leadRadarDisconnectTelegramAccount(requestKey);
      disconnectRequestKey.current = null;
      setAccount(next);
      setDisconnectConfirmation(false);
      setAccountNotice('Аккаунт отключён. Новые кампании заблокированы.');
      restoreFocus(connectButtonId);
    } catch (disconnectError) {
      if (hasDefiniteHttpResponse(disconnectError)) disconnectRequestKey.current = null;
      setAccountNotice(campaignErrorCopy(disconnectError));
    } finally {
      setAccountBusy(false);
    }
  }

  async function authorizeContact(): Promise<void> {
    if (!authorizationFormReady
      || !campaignRecoveryReady
      || !authorizationLead
      || !contactBasis
      || !authorizationExpiryIso) return;
    const normalizedReference = evidenceReference.trim();
    const fingerprint = JSON.stringify([
      searchId,
      authorizationLead.id,
      contactBasis,
      normalizedReference,
      authorizationExpiryIso,
    ]);
    const pending = authorizationRequest.current?.fingerprint === fingerprint
      ? authorizationRequest.current
      : {
        fingerprint,
        key: `lead-radar-campaign-eligibility-ui-${crypto.randomUUID()}`,
      };
    authorizationRequest.current = pending;
    setAuthorizationBusy(true);
    setAuthorizationNotice(null);
    setAuthorizationError(false);
    try {
      const next = await api.leadRadarAuthorizeTelegramCampaignContact({
        searchId,
        leadId: authorizationLead.id,
        contactBasis,
        evidenceReference: normalizedReference,
        expiresAt: authorizationExpiryIso,
      }, pending.key);
      if (next.companyId !== authorizationLead.id
        || !isValidCampaignRecipientAuthorization(next, contactBasis)) {
        throw Object.assign(new Error('Invalid contact authorization response'), { status: 502 });
      }
      authorizationRequest.current = null;
      setAuthorizedLeadIds((current) => new Set(current).add(authorizationLead.id));
      setAuthorizationNotice(`Основание для «${authorizationLead.name}» подтверждено сервером до ${formatDate(next.expiresAt)}.`);
      setAuthorizationError(false);
      setEvidenceReference('');
      setEvidenceExpiresAt('');
      setEvidenceAttested(false);
      const nextCandidate = selectedCorporateCandidates.find((lead) => (
        lead.id !== authorizationLead.id && !authorizedLeadIds.has(lead.id)
      ));
      if (nextCandidate) setAuthorizationLeadId(nextCandidate.id);
      invalidatePreparation();
    } catch (authorizationFailure) {
      if (hasDefiniteHttpResponse(authorizationFailure)) authorizationRequest.current = null;
      const code = (authorizationFailure as { code?: string })?.code;
      setAuthorizationError(true);
      setAuthorizationNotice(code === 'telegram_campaign_invalid_input'
        ? 'Проверьте ссылку на доказательство и срок действия. Запись не создана.'
        : code === 'telegram_campaign_eligibility_required'
          ? 'Сервер не подтвердил корпоративный endpoint этой компании или обнаружил DNC. Запись не создана.'
          : campaignErrorCopy(authorizationFailure));
    } finally {
      setAuthorizationBusy(false);
    }
  }

  async function prepareCampaign(): Promise<void> {
    const accountId = accountConnectionId;
    if (!campaignOutreachEnabled
      || !connected
      || !accountId
      || !accountIdentityConfirmed
      || account?.identityReviewRequired
      || !campaignRecoveryReady
      || !contactBasis
      || operationBusy
      || selectedLeadIds.size === 0
      || !isCampaignTemplateReady(template)) return;
    const requestKey = prepareRequestKey.current ?? `lead-radar-campaign-prepare-ui-${crypto.randomUUID()}`;
    prepareRequestKey.current = requestKey;
    setOperationBusy(true);
    setOperationNotice(null);
    setOperationError(false);
    try {
      const next = await api.leadRadarPrepareTelegramCampaign({
        accountId,
        searchId,
        leadIds: [...selectedLeadIds],
        template,
        contactBasis,
      }, requestKey);
      if (!validPreparation(next)) throw Object.assign(new Error('Invalid campaign preparation'), { status: 502 });
      prepareRequestKey.current = null;
      setPreparationClock(Date.now());
      setPreparation(next);
      setExactConfirmation(false);
      const summary = preparationSummary(next);
      setOperationNotice(summary && summary.automatic > 0
        ? 'Сервер проверил точный список и текст. Просмотрите итог перед запуском.'
        : 'Сервер не подтвердил ни одного адресата для автоматической отправки. Кампания не может быть запущена.');
    } catch (prepareError) {
      if (hasDefiniteHttpResponse(prepareError)) prepareRequestKey.current = null;
      setPreparation(null);
      setExactConfirmation(false);
      setOperationError(true);
      setOperationNotice(campaignErrorCopy(prepareError));
    } finally {
      setOperationBusy(false);
    }
  }

  async function transitionCampaign(action: 'start' | 'pause' | 'resume' | 'stop', campaignId = campaign?.id): Promise<LeadRadarTelegramCampaignReadModel | null> {
    if (!campaignId || operationBusy) return null;
    if ((action === 'start' || action === 'resume') && !campaignAutoSendEnabled) {
      setOperationError(true);
      setOperationNotice('Автоматический запуск ещё не разрешён защитным переключателем. Кампания остаётся без новых отправок.');
      return null;
    }
    if ((action === 'start' || action === 'resume') && (!connected || !accountIdentityConfirmed)) {
      setOperationError(true);
      setOperationNotice('Перед запуском подтвердите, что подключён нужный Telegram-аккаунт. Новых отправок не было.');
      return null;
    }
    if (action === 'resume' && resumeBlock) {
      setOperationError(true);
      setOperationNotice(RESUME_BLOCK_COPY[resumeBlock]);
      return null;
    }
    const requestKey = transitionRequestKeys.current[action]
      ?? `lead-radar-campaign-${action}-ui-${crypto.randomUUID()}`;
    transitionRequestKeys.current[action] = requestKey;
    setOperationBusy(true);
    setOperationNotice(null);
    setOperationError(false);
    try {
      const response = await api.leadRadarTransitionTelegramCampaign(campaignId, action, requestKey);
      const next = campaignFromMutation(response);
      if (!validCampaignReadModel(next)) throw Object.assign(new Error('Invalid campaign transition'), { status: 502 });
      delete transitionRequestKeys.current[action];
      setCampaignClock(Date.now());
      setCampaign(next);
      setStopConfirmation(false);
      if (action === 'stop') restoreFocus(campaignStateHeadingId);
      setOperationNotice(action === 'start'
        ? 'Кампания принята сервером. Счётчик «подтверждено Telegram» обновится только после ответа транспорта.'
        : action === 'pause'
          ? 'Пауза подтверждена сервером. Новые адресаты не резервируются.'
          : action === 'resume'
            ? 'Продолжение подтверждено сервером.'
            : 'Остановка подтверждена сервером. Неотправленные адресаты отменены.');
      return next;
    } catch (transitionError) {
      if (hasDefiniteHttpResponse(transitionError)) delete transitionRequestKeys.current[action];
      setOperationError(true);
      setOperationNotice(campaignErrorCopy(transitionError));
      return null;
    } finally {
      setOperationBusy(false);
    }
  }

  async function createAndStartCampaign(): Promise<void> {
    const accountId = accountConnectionId;
    if (!createReady || !preparation || !accountId || !contactBasis) return;
    const requestKey = createRequestKey.current ?? `lead-radar-campaign-create-ui-${crypto.randomUUID()}`;
    createRequestKey.current = requestKey;
    setOperationBusy(true);
    setOperationNotice(null);
    setOperationError(false);
    let created: LeadRadarTelegramCampaignReadModel;
    try {
      const response = await api.leadRadarCreateTelegramCampaign({
        accountId,
        searchId,
        leadIds: [...selectedLeadIds],
        template,
        contactBasis,
        approvalToken: preparation.approvalToken,
        selectionDigest: preparation.selectionDigest,
        contentDigest: preparation.contentDigest,
      }, requestKey);
      created = campaignFromMutation(response);
      if (!validCampaignReadModel(created)) throw Object.assign(new Error('Invalid campaign create response'), { status: 502 });
      createRequestKey.current = null;
      setCampaignClock(Date.now());
      setCampaign(created);
      if (created.status !== 'approved') {
        setOperationError(true);
        setOperationNotice('Кампания сохранена, но сервер не подтвердил её готовность к запуску. Сообщения не отправляются.');
        return;
      }
      if (!campaignAutoSendEnabled) {
        setOperationNotice('Кампания создана и остаётся без отправок. Запуск закрыт отдельным защитным переключателем.');
        return;
      }
    } catch (createError) {
      if (hasDefiniteHttpResponse(createError)) createRequestKey.current = null;
      if ((createError as { code?: string })?.code === 'telegram_campaign_active_exists') {
        await recoverCampaign();
        return;
      }
      setOperationError(true);
      setOperationNotice(campaignErrorCopy(createError));
      return;
    } finally {
      setOperationBusy(false);
    }
    await transitionCampaign('start', created.id);
  }

  async function refreshCampaign(): Promise<void> {
    if (!campaign || operationBusy) return;
    setOperationBusy(true);
    setOperationNotice(null);
    setOperationError(false);
    try {
      const next = await api.leadRadarTelegramCampaign(campaign.id);
      if (!validCampaignReadModel(next)) throw Object.assign(new Error('Invalid campaign read model'), { status: 502 });
      setCampaignClock(Date.now());
      setCampaign(next);
    } catch (refreshError) {
      setOperationError(true);
      setOperationNotice(campaignErrorCopy(refreshError));
    } finally {
      setOperationBusy(false);
    }
  }

  const progressDone = campaign
    ? campaign.counts.sent + campaign.counts.failed + campaign.counts.ambiguous + campaign.counts.skipped
    : 0;
  const progressPercent = campaign?.counts.total
    ? Math.min(100, Math.round(progressDone / campaign.counts.total * 100))
    : 0;
  const campaignPauseUntil = campaign?.pausedUntil
    ?? (campaign?.status === 'paused' ? campaign.nextSendAt ?? null : null);
  const accountStatus = account?.status ?? null;
  const accountCopy = accountStatus ? ACCOUNT_STATUS_COPY[accountStatus] : null;
  const canRequestConnection = Boolean(
    telegramAccountEnabled
    && accountStatus
    && ['disconnected', 'error', 'revoked'].includes(accountStatus),
  );

  return (
    <section aria-labelledby={headingId} data-testid="lead-radar-telegram-campaign" className="space-y-4 motion-reduce:[&_button]:transform-none motion-reduce:[&_button]:transition-none">
      <Card className="overflow-hidden border-brand-cyan/15 bg-[#08111f]/88 p-0">
        <div className="border-b border-white/[0.07] bg-[linear-gradient(135deg,rgba(47,230,209,.08),rgba(34,158,217,.04))] p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-cyan">Управляемая кампания</p>
              <h2 id={headingId} className="mt-1 text-xl font-semibold text-white">Отдельный Telegram-аккаунт</h2>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Выберите до 50 компаний и запустите одну кампанию. Сообщения обрабатываются последовательно; Pause и Stop доступны в любой момент.
              </p>
            </div>
            {!telegramAccountEnabled ? (
              <Badge tone="warning">Планирование доступно</Badge>
            ) : accountLoading && !account ? (
              <span role="status" aria-live="polite" aria-atomic="true" className="inline-flex min-h-12 items-center gap-2 text-sm text-white/65">
                <LoaderCircle size={17} className="motion-safe:animate-spin" aria-hidden="true" />Проверяем аккаунт…
              </span>
            ) : accountCopy ? (
              <div role="status" aria-live="polite" aria-atomic="true" className="max-w-sm rounded-xl border border-white/[0.09] bg-white/[0.025] p-3">
                <Badge tone={accountCopy.tone}>{accountCopy.label}</Badge>
                <p className="mt-2 text-xs leading-5 text-white/65">{accountCopy.detail}</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          {(campaignRecovering || (telegramAccountEnabled && recoveredSearchId !== searchId && !campaignRecoveryIssue)) && (
            <p role="status" aria-live="polite" aria-atomic="true" className="flex min-h-12 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 text-sm text-white/70">
              <LoaderCircle size={17} className="motion-safe:animate-spin" aria-hidden="true" />Восстанавливаем кампанию этой выдачи…
            </p>
          )}
          {campaignRecoveryIssue && (
            <div role="alert" className="flex flex-col gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.045] p-4 text-sm leading-6 text-amber-50/90 sm:flex-row sm:items-center sm:justify-between">
              <p><strong className="text-white">Состояние кампании не подтверждено.</strong> {campaignRecoveryIssue} {campaignOutreachEnabled ? 'Серверная подготовка и запуск заблокированы до успешной проверки.' : 'Локальный выбор и оффер доступны, но серверные действия остаются закрыты.'}</p>
              <Button type="button" variant="secondary" disabled={campaignRecovering} aria-busy={campaignRecovering} onClick={() => { void recoverCampaign(); }} className="min-h-12 shrink-0">
                <RefreshCw size={16} className={campaignRecovering ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />Повторить проверку
              </Button>
            </div>
          )}
          {(!telegramAccountEnabled || !campaignOutreachEnabled || !campaignAutoSendEnabled) && (
            <div role="note" className="flex items-start gap-3 rounded-xl border border-amber-300/18 bg-amber-300/[0.045] p-4 text-sm leading-6 text-amber-50/85">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-amber-200" aria-hidden="true" />
              <p><strong className="text-white">Контур отправки ещё не активирован.</strong> Вы можете выбрать до 50 компаний и подготовить оффер сейчас. {!telegramAccountEnabled ? 'Подключение аккаунта, серверная проверка и запуск' : !campaignOutreachEnabled ? 'Серверная проверка и запуск' : 'Запуск'} остаются fail-closed до отдельного разрешения.</p>
            </div>
          )}

          {telegramAccountEnabled && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.018] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Состояние аккаунта</h3>
                    <p className="mt-1 text-xs leading-5 text-white/60">Сессия хранится только на защищённом серверном шлюзе, не в браузере.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" disabled={accountLoading || accountBusy} onClick={() => { void loadAccount(); }} className="min-h-12">
                      <RefreshCw size={16} className={accountLoading ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />Статус
                    </Button>
                    {canRequestConnection && (
                      <Button id={connectButtonId} type="button" disabled={accountBusy || accountLoading} aria-busy={accountBusy} onClick={() => { void connectAccount(); }} className="min-h-12">
                        {accountBusy ? <LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : <QrCode size={16} aria-hidden="true" />}
                        {accountBusy ? 'Готовим QR…' : accountStatus === 'disconnected' || accountStatus === 'revoked' ? 'Подключить аккаунт' : 'Переподключить'}
                      </Button>
                    )}
                  </div>
                </div>
                {account?.status === 'connected' && (
                  <div className="mt-4 space-y-3">
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-white/[0.08] p-3">
                        <dt className="text-xs font-medium uppercase tracking-wide text-white/60">Telegram подтвердил</dt>
                        <dd className="mt-1 break-words text-base font-semibold text-white">{accountIdentityLabel ?? 'Личность не возвращена сервером'}</dd>
                        {account.username && accountIdentityLabel !== `@${account.username.replace(/^@/, '')}` && <dd className="mt-1 text-sm text-white/70">@{account.username.replace(/^@/, '')}</dd>}
                        {account.phoneMasked && <dd className="mt-1 text-sm text-white/70">{account.phoneMasked}</dd>}
                      </div>
                      <div className="rounded-xl border border-white/[0.08] p-3">
                        <dt className="text-xs font-medium uppercase tracking-wide text-white/60">Последняя проверка сессии</dt>
                        <dd className="mt-1 text-sm text-white/85">{formatDate(account.identityVerifiedAt || account.lastHealthAt || account.connectedAt)}</dd>
                        <dd className="mt-1 text-xs leading-5 text-white/60">Запуск возможен только после вашей сверки этой карточки.</dd>
                      </div>
                    </dl>
                    <label className={`flex min-h-12 items-start gap-3 rounded-xl border p-3 text-sm leading-6 ${accountIdentityAvailable && !account.identityReviewRequired ? 'cursor-pointer border-brand-cyan/25 bg-brand-cyan/[0.04] text-white/85' : 'cursor-not-allowed border-amber-300/20 bg-amber-300/[0.04] text-amber-50/80'}`}>
                      <input
                        type="checkbox"
                        checked={accountIdentityConfirmed}
                        disabled={!accountIdentityAvailable || Boolean(account.identityReviewRequired) || accountBusy}
                        onChange={(event) => setAccountIdentityConfirmed(event.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-[#2fe6d1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                      />
                      <span><strong className="block text-white">Это нужный аккаунт для текущей кампании</strong>Подтверждение действует только для этой подключённой сессии и сбрасывается после переподключения.</span>
                    </label>
                    {(!accountIdentityAvailable || account.identityReviewRequired) && (
                      <p role="alert" className="rounded-xl border border-amber-300/18 bg-amber-300/[0.04] p-3 text-xs leading-5 text-amber-50/85">
                        Сервер не подтвердил достаточно данных для сверки аккаунта. Кампании остаются заблокированы; обновите статус или переподключите аккаунт.
                      </p>
                    )}
                  </div>
                )}
                {accountNotice && (
                  <p role="status" aria-live="polite" aria-atomic="true" className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs leading-5 text-amber-50/80">{accountNotice}</p>
                )}
                {account && (Boolean(accountConnectionId) || account.status === 'pending' || account.status === 'connecting') && !disconnectConfirmation && (
                  <button id={disconnectButtonId} type="button" disabled={accountBusy || accountLoading} onClick={() => setDisconnectConfirmation(true)} className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-xl px-3 text-sm font-medium text-white/70 hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-50">
                    <Unplug size={16} aria-hidden="true" />{account.status === 'pending' || account.status === 'connecting' ? 'Отменить подключение' : 'Отключить аккаунт'}
                  </button>
                )}
                {disconnectConfirmation && (
                  <div ref={disconnectConfirmationRef} tabIndex={-1} role="group" aria-label="Подтверждение отключения Telegram-аккаунта" className="mt-3 rounded-xl border border-rose-300/18 bg-rose-400/[0.045] p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
                    <p className="text-sm leading-6 text-rose-50/85">{account?.status === 'pending' || account?.status === 'connecting' ? 'QR станет недействительным, незавершённое подключение будет отменено. Сообщения не отправлялись.' : 'Отключение немедленно блокирует новые отправки и отзывает защищённую серверную сессию.'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="danger" disabled={accountBusy || accountLoading} onClick={() => { void disconnectAccount(); }} className="min-h-12">{account?.status === 'pending' || account?.status === 'connecting' ? 'Отменить подключение' : 'Подтвердить отключение'}</Button>
                      <Button type="button" variant="secondary" disabled={accountBusy || accountLoading} onClick={() => { setDisconnectConfirmation(false); restoreFocus(disconnectButtonId); }} className="min-h-12">Вернуться</Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid min-h-44 place-items-center rounded-2xl border border-white/[0.08] bg-[#05070d]/55 p-4 text-center">
                {account?.status === 'connecting' || account?.status === 'pending' ? (
                  qrExpired ? (
                    <div role="status" aria-live="polite" aria-atomic="true" className="max-w-xs">
                      <Clock3 size={36} className="mx-auto text-amber-200" aria-hidden="true" />
                      <p className="mt-3 text-sm font-medium text-white">Срок QR истёк</p>
                      <p className="mt-1 text-xs leading-5 text-white/60">Чтобы создать новый QR, отмените истёкшее подключение, затем нажмите «Подключить аккаунт». Старый код больше не используется; сообщения не отправлялись.</p>
                    </div>
                  ) : safeQr || safeQrLoginUrl ? (
                    <div className="w-full">
                      {safeQr ? (
                        <img src={safeQr} alt="QR-код для подключения выделенного Telegram-аккаунта" className="mx-auto h-44 w-44 rounded-xl bg-white p-2" />
                      ) : (
                        <QrCode size={36} className="mx-auto text-brand-cyan" aria-hidden="true" />
                      )}
                      <p className="mt-3 text-sm text-white/70">{safeQr ? <>В Telegram откройте <strong className="text-white">Настройки → Устройства → Подключить устройство</strong>.</> : 'PNG-код недоступен. Откройте короткоживущую ссылку на устройстве с Telegram.'}</p>
                      <p className="mt-1 text-xs text-white/60">QR действует до {formatDate(account.qr?.expiresAt ?? null)}</p>
                      {safeQrLoginUrl && (
                        <a href={safeQrLoginUrl} target="_blank" rel="noreferrer" className="mx-auto mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-brand-cyan/30 bg-brand-cyan/[0.07] px-4 py-2 text-sm font-semibold text-white hover:bg-brand-cyan/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan sm:w-auto">
                          <ExternalLink size={16} aria-hidden="true" />Открыть в Telegram на этом устройстве
                        </a>
                      )}
                      {safeQrLoginUrl && <p className="mt-2 text-xs leading-5 text-white/55">Приложение держит ссылку только в памяти этой вкладки до истечения QR и не записывает её в локальное хранилище.</p>}
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
                        <Button type="button" variant="secondary" disabled={accountLoading || accountBusy} onClick={() => { void refreshConnectionStatus(); }} className="min-h-12">
                          <RefreshCw size={16} className={accountLoading ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />Я отсканировал — проверить
                        </Button>
                        <Button type="button" variant="ghost" disabled={accountLoading || accountBusy} onClick={() => setDisconnectConfirmation(true)} className="min-h-12">
                          <Unplug size={16} aria-hidden="true" />Отменить
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div role="status" aria-live="polite" aria-atomic="true" className="max-w-xs">
                      <QrCode size={36} className="mx-auto text-brand-cyan" aria-hidden="true" />
                      <p className="mt-3 text-sm font-medium text-white">QR ещё готовится</p>
                      <p className="mt-1 text-xs leading-5 text-white/60">Сервер не вернул безопасное PNG-изображение. Отправка остаётся закрытой; обновите статус.</p>
                    </div>
                  )
                ) : connected ? (
                  <div>
                    <CheckCircle2 size={36} className="mx-auto text-emerald-300" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-white">Аккаунт подтверждён</p>
                    <p className="mt-1 text-xs leading-5 text-white/60">Можно подготовить точный список кампании.</p>
                  </div>
                ) : (
                  <div>
                    <QrCode size={36} className="mx-auto text-white/35" aria-hidden="true" />
                    <p className="mt-3 text-xs leading-5 text-white/55">QR появится здесь только после ответа защищённого сервера.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="h-px bg-white/[0.07]" aria-hidden="true" />

          <div className="grid gap-5 xl:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.1fr)]">
            <fieldset disabled={operationBusy || !campaignRecoveryReady || Boolean(campaign)} className="min-w-0">
              <legend className="text-sm font-semibold text-white">1. Выберите компании</legend>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-5 text-white/60">Выбрано <span className="font-semibold tabular-nums text-white">{selectedLeadIds.size}/{LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT}</span></p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" disabled={automaticLeadCount === 0 || Boolean(campaign)} onClick={selectAllEligible} className="min-h-12">
                    <UsersRound size={16} aria-hidden="true" />Выбрать корпоративных кандидатов ({Math.min(automaticLeadCount, LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT)})
                  </Button>
                  <Button type="button" variant="ghost" disabled={selectedLeadIds.size === 0 || Boolean(campaign)} onClick={() => { setSelectedLeadIds(new Set()); invalidatePreparation(); }} className="min-h-12">Снять выбор</Button>
                </div>
              </div>
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1" aria-label="Компании для Telegram-кампании">
                {leads.map((lead) => {
                  const local = classifyCampaignLeadLocally(lead);
                  const copy = LOCAL_CLASSIFICATION_COPY[local.classification];
                  const selectable = isSelectableCampaignLead(lead);
                  return (
                    <label key={lead.id} className={`flex min-h-12 items-start gap-3 rounded-xl border p-3 transition-colors motion-reduce:transition-none ${selectable ? 'cursor-pointer border-white/[0.08] hover:bg-white/[0.025]' : 'cursor-not-allowed border-rose-300/10 bg-rose-400/[0.025]'}`}>
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.has(lead.id)}
                        disabled={!selectable || operationBusy || Boolean(campaign)}
                        onChange={() => toggleLead(lead)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-[#2fe6d1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white/80">{lead.name}</span>
                        <span className="mt-1 block text-[11px] text-white/50">{lead.city} · {lead.priority}</span>
                        <span className="mt-1 block text-xs leading-5 text-white/65">{LOCAL_REASON_COPY[local.reason]}</span>
                      </span>
                      <Badge tone={copy.tone}>{copy.label}</Badge>
                    </label>
                  );
                })}
              </div>
              {leads.length === 0 && <p className="mt-3 rounded-xl border border-dashed border-white/[0.1] p-4 text-sm text-white/55">Сначала дождитесь найденных компаний.</p>}
              <p className="mt-3 text-xs leading-5 text-white/65">Кнопка выбирает только кандидатов с проверенным корпоративным endpoint. Это ещё не разрешение на сообщение: сервер отдельно проверит действующее основание по каждой компании. Контакты «Нужна проверка» можно добавить вручную; DNC всегда исключается.</p>
            </fieldset>

            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white">2. Подготовьте один оффер</h3>
              <div className="mt-3">
                <Label htmlFor={`${composerHelpId}-input`}>Текст кампании</Label>
                <Textarea
                  id={`${composerHelpId}-input`}
                  value={template}
                  rows={9}
                  required
                  disabled={operationBusy || !campaignRecoveryReady || Boolean(campaign)}
                  aria-describedby={`${composerHelpId}${templateIssue ? ` ${composerHelpId}-error` : ''}`}
                  aria-errormessage={templateIssue ? `${composerHelpId}-error` : undefined}
                  aria-invalid={Boolean(templateIssue)}
                  onChange={(event) => updateTemplate(event.target.value)}
                  className="min-h-48 resize-y"
                />
                <div id={composerHelpId} className="mt-2 flex flex-col gap-1 text-xs leading-5 text-white/60 sm:flex-row sm:items-center sm:justify-between">
                  <span>Разрешённая переменная: {'{company_name}'}. Точный текст фиксирует сервер.</span>
                  <span className="shrink-0 tabular-nums">{[...template].length}/{LEAD_RADAR_CAMPAIGN_MESSAGE_LIMIT}</span>
                </div>
                {templateIssue && <p id={`${composerHelpId}-error`} className="mt-2 text-sm leading-5 text-amber-100">{templateIssue}</p>}
              </div>

              <div className="mt-4">
                <Label htmlFor={`${composerHelpId}-basis`}>Тип документированного основания</Label>
                <Select
                  id={`${composerHelpId}-basis`}
                  value={contactBasis}
                  required
                  disabled={operationBusy || !campaignRecoveryReady || Boolean(campaign)}
                  onChange={(event) => {
                    setContactBasis(event.target.value as LeadRadarCampaignContactBasis | '');
                    setEvidenceAttested(false);
                    setAuthorizationNotice(null);
                    setAuthorizationError(false);
                    setAuthorizedLeadIds(new Set());
                    authorizationRequest.current = null;
                    invalidatePreparation();
                  }}
                  className="min-h-12"
                >
                  <option value="">Укажите тип основания</option>
                  {Object.entries(CONTACT_BASIS_COPY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
                <p className="mt-2 text-xs leading-5 text-amber-50/80">Выбор пункта не создаёт разрешение. Для автоотправки сервер должен найти отдельную действующую запись основания по каждой компании. Публичный username или телефон не являются согласием.</p>
              </div>

              {contactBasis && selectedCorporateCandidates.length > 0 && (
                <details className="mt-4 rounded-xl border border-white/[0.09] bg-white/[0.018]">
                  <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3 text-sm font-medium text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-cyan">
                    <span>Подтвердить документ по одной компании</span>
                    <span className="shrink-0 text-xs font-normal text-white/65">В этой сессии {selectedCorporateCandidates.filter((lead) => authorizedLeadIds.has(lead.id)).length}/{selectedCorporateCandidates.length}</span>
                  </summary>
                  <div className="space-y-4 border-t border-white/[0.07] p-3 sm:p-4">
                    <p className="text-sm leading-6 text-white/70">Запись создаётся отдельно для компании и её текущего корпоративного Telegram. Если действующая запись уже есть, этот шаг можно пропустить и запустить серверную проверку.</p>
                    <div>
                      <Label htmlFor={`${composerHelpId}-authorization-lead`}>Компания</Label>
                      <Select
                        id={`${composerHelpId}-authorization-lead`}
                        value={authorizationLeadId}
                        disabled={authorizationBusy || operationBusy || !campaignRecoveryReady || Boolean(campaign)}
                        onChange={(event) => {
                          setAuthorizationLeadId(event.target.value);
                          setEvidenceReference('');
                          setEvidenceExpiresAt('');
                          setEvidenceAttested(false);
                          setAuthorizationNotice(null);
                          setAuthorizationError(false);
                          authorizationRequest.current = null;
                        }}
                        className="min-h-12"
                      >
                        {selectedCorporateCandidates.map((lead) => (
                          <option key={lead.id} value={lead.id}>{authorizedLeadIds.has(lead.id) ? '✓ ' : ''}{lead.name}</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor={`${composerHelpId}-evidence-reference`}>Ссылка на доказательство</Label>
                      <Input
                        id={`${composerHelpId}-evidence-reference`}
                        value={evidenceReference}
                        maxLength={200}
                        autoComplete="off"
                        spellCheck={false}
                        disabled={authorizationBusy || operationBusy || !campaignRecoveryReady || Boolean(campaign)}
                        aria-describedby={`${composerHelpId}-evidence-help`}
                        aria-invalid={evidenceReference.length > 0 && !evidenceReferenceReady}
                        onChange={(event) => {
                          setEvidenceReference(event.target.value);
                          setEvidenceAttested(false);
                          setAuthorizationNotice(null);
                          setAuthorizationError(false);
                          authorizationRequest.current = null;
                        }}
                        placeholder="Например: CRM-заявка #…, договор #…"
                        className="min-h-12"
                      />
                      <p id={`${composerHelpId}-evidence-help`} className="mt-2 text-xs leading-5 text-white/65">От 8 до 200 символов. Не вставляйте текст переписки или персональные данные: сервер сохранит только криптографический отпечаток ссылки.</p>
                    </div>
                    <div>
                      <Label htmlFor={`${composerHelpId}-evidence-expiry`}>Действует до</Label>
                      <Input
                        id={`${composerHelpId}-evidence-expiry`}
                        type="datetime-local"
                        value={evidenceExpiresAt}
                        min={authorizationMin}
                        max={authorizationMax}
                        disabled={authorizationBusy || operationBusy || !campaignRecoveryReady || Boolean(campaign)}
                        aria-describedby={`${composerHelpId}-expiry-help`}
                        aria-invalid={evidenceExpiresAt.length > 0 && !evidenceExpiryReady}
                        onChange={(event) => {
                          setEvidenceExpiresAt(event.target.value);
                          setEvidenceAttested(false);
                          setAuthorizationNotice(null);
                          setAuthorizationError(false);
                          authorizationRequest.current = null;
                        }}
                        className="min-h-12 [color-scheme:dark]"
                      />
                      <p id={`${composerHelpId}-expiry-help`} className="mt-2 text-xs leading-5 text-white/65">Выберите реальный срок документа: в будущем, максимум 366 дней.</p>
                    </div>
                    <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-white/[0.1] p-3 text-sm leading-6 text-white/80 hover:bg-white/[0.025]">
                      <input
                        type="checkbox"
                        checked={evidenceAttested}
                        disabled={authorizationBusy || operationBusy || !campaignRecoveryReady || !evidenceReferenceReady || !evidenceExpiryReady || Boolean(campaign)}
                        onChange={(event) => setEvidenceAttested(event.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-[#2fe6d1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                      />
                      <span><strong className="block text-white">Я сверил документ именно для «{authorizationLead?.name ?? 'компании'}»</strong>Он разрешает обращение по выбранному типу основания и относится к текущему корпоративному Telegram.</span>
                    </label>
                    <Button type="button" disabled={!authorizationFormReady} aria-busy={authorizationBusy} onClick={() => { void authorizeContact(); }} className="min-h-12 w-full">
                      {authorizationBusy ? <LoaderCircle size={17} className="motion-safe:animate-spin" aria-hidden="true" /> : <ShieldCheck size={17} aria-hidden="true" />}
                      {authorizationBusy ? 'Сохраняем подтверждение…' : 'Подтвердить основание для компании'}
                    </Button>
                    {authorizationNotice && (
                      <p role={authorizationError ? 'alert' : 'status'} aria-live={authorizationError ? 'assertive' : 'polite'} aria-atomic="true" className={`rounded-xl border p-3 text-sm leading-6 ${authorizationError ? 'border-amber-300/18 bg-amber-300/[0.04] text-amber-50/90' : 'border-emerald-300/18 bg-emerald-300/[0.04] text-emerald-50/90'}`}>
                        {authorizationNotice}
                      </p>
                    )}
                  </div>
                </details>
              )}

              {selectedLeadIds.size > 0 && (
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Предварительная разбивка выбранных компаний">
                  <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.035] p-3"><div className="text-[10px] uppercase text-white/50">Кандидаты авто</div><div className="mt-1 text-xl font-semibold tabular-nums text-emerald-200">{localSummary.automatic}</div></div>
                  <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-3"><div className="text-[10px] uppercase text-white/50">Вручную</div><div className="mt-1 text-xl font-semibold tabular-nums text-amber-100">{localSummary.manual}</div></div>
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.018] p-3"><div className="text-[10px] uppercase text-white/50">Исключатся</div><div className="mt-1 text-xl font-semibold tabular-nums text-white/75">{localSummary.excluded}</div></div>
                </div>
              )}

              <Button
                type="button"
                size="lg"
                disabled={!campaignOutreachEnabled || !campaignRecoveryReady || !connected || !accountIdentityConfirmed || !contactBasis || selectedLeadIds.size === 0 || !isCampaignTemplateReady(template) || operationBusy || Boolean(campaign)}
                aria-busy={operationBusy && !preparation}
                onClick={() => { void prepareCampaign(); }}
                className="mt-4 min-h-12 w-full"
              >
                {operationBusy && !preparation ? <LoaderCircle size={17} className="motion-safe:animate-spin" aria-hidden="true" /> : <ShieldCheck size={17} aria-hidden="true" />}
                Проверить список и текст на сервере
              </Button>
              {!campaignOutreachEnabled
                ? <p className="mt-2 text-xs leading-5 text-amber-50/70">Серверная проверка кампаний ещё не разрешена. Локальный выбор и оффер сохраните в этой вкладке.</p>
                : !connected
                  ? <p className="mt-2 text-xs leading-5 text-amber-50/75">Для серверной проверки сначала подключите отдельный аккаунт.</p>
                  : !accountIdentityConfirmed && <p className="mt-2 text-xs leading-5 text-amber-50/75">Сверьте карточку подключённого аккаунта и отметьте «Это нужный аккаунт».</p>}
            </div>
          </div>

          {preparation && serverSummary && !campaign && (
            <div className="rounded-2xl border border-brand-cyan/18 bg-brand-cyan/[0.035] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 ref={reviewHeadingRef} tabIndex={-1} className="rounded-sm text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">3. Серверная проверка</h3>
                  <p className="mt-1 text-xs leading-5 text-white/60">Подтверждение действует до {formatDate(preparation.expiresAt)}. Любое изменение списка или текста аннулирует его.</p>
                </div>
                <Badge tone={preparationExpired ? 'danger' : serverSummary.automatic > 0 ? 'success' : 'warning'}>
                  {preparationExpired ? 'Истекло' : 'Состав зафиксирован'}
                </Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                {([
                  ['Выбрано', serverSummary.selected],
                  ['Кандидаты сервера', serverSummary.automatic],
                  ['Основание подтверждено', authorizedRecipientCount],
                  ['Только вручную', serverSummary.manual],
                  ['Исключено', serverSummary.excluded],
                ] as const).map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-white/[0.08] bg-[#05070d]/35 p-3"><dt className="text-[10px] uppercase text-white/50">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-white">{value}</dd></div>
                ))}
              </dl>

              {previewComplete ? (
                <div className="mt-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <h4 className="text-sm font-semibold text-white">Все персонализированные сообщения</h4>
                    <p className="text-xs text-white/65">Показаны все: {previewItems.length}/{serverSummary.automatic}</p>
                  </div>
                  <ol tabIndex={0} role="region" aria-label={`Полный предпросмотр ${previewItems.length} сообщений`} className="mt-2 max-h-[32rem] space-y-2 overflow-y-auto rounded-xl border border-white/[0.08] bg-[#05070d]/35 p-2 pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
                    {previewItems.map((preview, index) => (
                      <li key={preview.leadId} className="rounded-lg border border-white/[0.08] bg-[#05070d]/55 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <p className="break-words text-sm font-semibold text-brand-cyan">{index + 1}. {preview.companyName}</p>
                          {isValidCampaignRecipientAuthorization(preview.authorization, contactBasis, preparationClock)
                            ? <Badge tone="success">Основание до {formatDate(preview.authorization.expiresAt)}</Badge>
                            : <Badge tone="warning">Основание не подтверждено</Badge>}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-white/80">{preview.text}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : (
                <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-300/20 bg-rose-400/[0.045] p-3 text-sm leading-6 text-rose-50/90">
                  <AlertTriangle size={17} className="mt-1 shrink-0" aria-hidden="true" />Сервер не вернул полный точный предпросмотр всех автоматических сообщений. Подтверждение и запуск заблокированы; выполните проверку заново.
                </p>
              )}

              {previewComplete && !authorizationComplete && (
                <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.045] p-3 text-sm leading-6 text-amber-50/90">
                  <AlertTriangle size={17} className="mt-1 shrink-0" aria-hidden="true" />Выбранное в форме основание само по себе не является доказательством. Сервер не подтвердил действующую запись разрешения отдельно для каждой компании, поэтому автоматический запуск заблокирован.
                </p>
              )}

              {nonAutomaticReviewItems.length > 0 && (
                <details className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.018]">
                  <summary className="flex min-h-12 cursor-pointer items-center px-3 text-sm font-medium text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-cyan">
                    Не войдут в автоматическую отправку: {nonAutomaticReviewItems.length}
                  </summary>
                  <ul className="space-y-2 border-t border-white/[0.07] p-3">
                    {nonAutomaticReviewItems.map((recipient) => (
                      <li key={recipient.leadId} className="rounded-lg border border-white/[0.07] p-3 text-sm leading-6 text-white/75">
                        <span className="font-medium text-white">{recipient.companyName}</span>
                        <span className="mt-1 block">{SERVER_REASON_COPY[recipient.reasonCode] ?? 'Сервер не подтвердил право на автоматическую отправку.'}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <label className={`mt-4 flex min-h-12 items-start gap-3 rounded-xl border p-3 text-sm leading-6 ${reviewComplete && !preparationExpired ? 'cursor-pointer border-white/[0.1] text-white/85 hover:bg-white/[0.025]' : 'cursor-not-allowed border-white/[0.07] text-white/55'}`}>
                <input
                  type="checkbox"
                  checked={exactConfirmation}
                  disabled={operationBusy || preparationExpired || serverSummary.automatic === 0 || !reviewComplete}
                  onChange={(event) => setExactConfirmation(event.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#2fe6d1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                />
                <span><span className="block font-medium text-white">Я просмотрел все {serverSummary.automatic} сообщений и подтверждаю точный состав</span>Основание: {contactBasis ? CONTACT_BASIS_COPY[contactBasis] : 'не выбрано'}. Сервер проверил доказательства по каждому адресату; DNC повторно проверяется перед отправкой, а Stop остаётся доступен.</span>
              </label>

              <Button type="button" size="lg" disabled={!createReady} aria-busy={operationBusy} onClick={() => { void createAndStartCampaign(); }} className="mt-4 min-h-12 w-full">
                {operationBusy ? <LoaderCircle size={18} className="motion-safe:animate-spin" aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
                {operationBusy ? 'Создаём кампанию…' : campaignAutoSendEnabled ? 'Создать и запустить кампанию' : 'Создать кампанию без запуска'}
              </Button>
            </div>
          )}

          {campaign && (
            <div className="rounded-2xl border border-white/[0.09] bg-[#05070d]/45 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-cyan">Кампания {campaign.id.slice(-8)}</p>
                  <h3 id={campaignStateHeadingId} tabIndex={-1} className="mt-1 rounded-sm text-base font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">{CAMPAIGN_STATUS_COPY[campaign.status].label}</h3>
                  <p className="mt-1 text-xs leading-5 text-white/60">{CAMPAIGN_STATUS_COPY[campaign.status].detail}</p>
                </div>
                <Badge tone={CAMPAIGN_STATUS_COPY[campaign.status].tone}>{CAMPAIGN_STATUS_COPY[campaign.status].label}</Badge>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-3 text-xs text-white/60">
                  <span>Обработано {progressDone} из {campaign.counts.total}</span>
                  <span className="tabular-nums">{progressPercent}%</span>
                </div>
                <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} aria-valuetext={`Обработано ${progressDone} из ${campaign.counts.total}`} aria-label="Прогресс Telegram-кампании" className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-blue to-brand-cyan transition-[width] motion-reduce:transition-none" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {([
                  ['Всего', campaign.counts.total],
                  ['Ожидают', campaign.counts.pending],
                  ['Telegram подтвердил', campaign.counts.sent],
                  ['Ошибки', campaign.counts.failed],
                  ['Итог неизвестен', campaign.counts.ambiguous],
                  ['Пропущено', campaign.counts.skipped],
                ] as const).map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-white/[0.08] p-3"><dt className="text-[10px] leading-4 uppercase text-white/50">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-white">{value}</dd></div>
                ))}
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                {campaign.status === 'approved' && <Button type="button" disabled={operationBusy || !campaignAutoSendEnabled || !connected || !accountIdentityConfirmed} onClick={() => { void transitionCampaign('start'); }} className="min-h-12"><PlayCircle size={17} aria-hidden="true" />Запустить</Button>}
                {campaign.status === 'running' && <Button type="button" variant="secondary" disabled={operationBusy} onClick={() => { void transitionCampaign('pause'); }} className="min-h-12"><PauseCircle size={17} aria-hidden="true" />Пауза</Button>}
                {campaign.status === 'paused' && <Button type="button" disabled={operationBusy || Boolean(resumeBlock)} aria-describedby={resumeBlock ? resumeHelpId : undefined} onClick={() => { void transitionCampaign('resume'); }} className="min-h-12"><PlayCircle size={17} aria-hidden="true" />Продолжить</Button>}
                {!isCampaignTerminal(campaign.status) && !stopConfirmation && <Button id={stopButtonId} type="button" variant="danger" disabled={operationBusy} onClick={() => setStopConfirmation(true)} className="min-h-12"><StopCircle size={17} aria-hidden="true" />Остановить</Button>}
                <Button type="button" variant="secondary" disabled={operationBusy} onClick={() => { void refreshCampaign(); }} className="min-h-12"><RefreshCw size={17} className={operationBusy ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />Обновить</Button>
                {isCampaignTerminal(campaign.status) && (
                  <Button type="button" variant="ghost" disabled={operationBusy} onClick={() => {
                    setCampaign(null);
                    invalidatePreparation();
                    setOperationNotice('Карточка завершённой кампании закрыта. Можно подготовить новую.');
                    setOperationError(false);
                  }} className="min-h-12">Подготовить новую</Button>
                )}
              </div>

              {campaign.status === 'approved' && (!connected || !accountIdentityConfirmed) && (
                <p className="mt-3 text-sm leading-6 text-amber-50/85">Для запуска подключите нужный аккаунт и подтвердите его карточку выше.</p>
              )}
              {campaign.status === 'paused' && resumeBlock && (
                <p id={resumeHelpId} role="note" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300/18 bg-amber-300/[0.04] p-3 text-sm leading-6 text-amber-50/90">
                  <AlertTriangle size={17} className="mt-1 shrink-0" aria-hidden="true" />{RESUME_BLOCK_COPY[resumeBlock]}
                </p>
              )}

              {stopConfirmation && !isCampaignTerminal(campaign.status) && (
                <div ref={stopConfirmationRef} tabIndex={-1} role="group" aria-label="Подтверждение остановки кампании" className="mt-3 rounded-xl border border-rose-300/18 bg-rose-400/[0.045] p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
                  <p className="text-sm leading-6 text-rose-50/85">Остановка терминальна: уже подтверждённые Telegram сообщения останутся, а все неотправленные адресаты будут отменены.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" variant="danger" disabled={operationBusy} onClick={() => { void transitionCampaign('stop'); }} className="min-h-12">Подтвердить Stop</Button>
                    <Button type="button" variant="secondary" disabled={operationBusy} onClick={() => { setStopConfirmation(false); restoreFocus(stopButtonId); }} className="min-h-12">Отмена</Button>
                  </div>
                </div>
              )}

              {campaignPauseUntil && <p className="mt-3 flex items-center gap-2 text-xs text-amber-100/75"><Clock3 size={15} aria-hidden="true" />Защитная пауза до {formatDate(campaignPauseUntil)}</p>}
              {campaign.counts.ambiguous > 0 && <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-amber-100/80"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />Неизвестные итоги не повторяются автоматически. Проверьте соответствующие чаты вручную.</p>}
            </div>
          )}

          {operationNotice && (
            <p role={operationError ? 'alert' : 'status'} aria-live={operationError ? 'assertive' : 'polite'} aria-atomic="true" className={`flex items-start gap-2 rounded-xl border p-3 text-sm leading-6 ${operationError ? 'border-amber-300/18 bg-amber-300/[0.045] text-amber-50/85' : 'border-brand-cyan/15 bg-brand-cyan/[0.035] text-white/75'}`}>
              {operationError ? <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" /> : <MessageCircle size={17} className="mt-0.5 shrink-0 text-brand-cyan" aria-hidden="true" />}
              {operationNotice}
            </p>
          )}
        </div>
      </Card>
    </section>
  );
}
