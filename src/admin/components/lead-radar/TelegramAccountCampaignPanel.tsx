import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
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
  boundCampaignTemplate,
  classifyCampaignLeadLocally,
  isCampaignTemplateReady,
  isSelectableCampaignLead,
  isTelegramAccountQrExpired,
  LEAD_RADAR_CAMPAIGN_MESSAGE_LIMIT,
  LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT,
  renderCampaignPreview,
  safeTelegramQrDataUrl,
  selectableCampaignLeadIds,
  type LeadRadarCampaignContactBasis,
  type LeadRadarCampaignRecipientClassification,
  type LeadRadarTelegramAccountState,
  type LeadRadarTelegramCampaignPreparation,
  type LeadRadarTelegramCampaignMutationResponse,
  type LeadRadarTelegramCampaignReadModel,
  type LeadRadarTelegramCampaignStatus,
} from '../../lib/lead-radar-campaign';
import { Badge, Button, Card, Label, Select, Textarea } from '../ui';

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

function campaignErrorCopy(error: unknown): string {
  const details = error as Error & { code?: string; status?: number; retryAfterSeconds?: number };
  if (details.code === 'telegram_campaign_disabled' || details.code === 'lead_radar_campaign_paused') {
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
  const [account, setAccount] = useState<LeadRadarTelegramAccountState | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountClock, setAccountClock] = useState(() => Date.now());
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const [disconnectConfirmation, setDisconnectConfirmation] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(() => new Set());
  const [template, setTemplate] = useState(() => boundCampaignTemplate(initialTemplate));
  const [contactBasis, setContactBasis] = useState<LeadRadarCampaignContactBasis | ''>('');
  const [preparation, setPreparation] = useState<LeadRadarTelegramCampaignPreparation | null>(null);
  const [preparationClock, setPreparationClock] = useState(() => Date.now());
  const [exactConfirmation, setExactConfirmation] = useState(false);
  const [campaign, setCampaign] = useState<LeadRadarTelegramCampaignReadModel | null>(null);
  const [operationBusy, setOperationBusy] = useState(false);
  const [operationNotice, setOperationNotice] = useState<string | null>(null);
  const [operationError, setOperationError] = useState(false);
  const [stopConfirmation, setStopConfirmation] = useState(false);
  const connectRequestKey = useRef<string | null>(null);
  const disconnectRequestKey = useRef<string | null>(null);
  const prepareRequestKey = useRef<string | null>(null);
  const createRequestKey = useRef<string | null>(null);
  const transitionRequestKeys = useRef<Partial<Record<'start' | 'pause' | 'resume' | 'stop', string>>>({});

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
    if (!campaign || isCampaignTerminal(campaign.status) || campaign.status === 'paused') return undefined;
    let cancelled = false;
    let timer: number | undefined;
    let consecutiveErrors = 0;
    const poll = async (): Promise<void> => {
      try {
        const next = await api.leadRadarTelegramCampaign(campaign.id);
        if (cancelled) return;
        if (!validCampaignReadModel(next)) throw new Error('Invalid campaign read model');
        setCampaign(next);
        setOperationNotice(null);
        setOperationError(false);
        consecutiveErrors = 0;
        if (isCampaignTerminal(next.status) || next.status === 'paused') return;
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
    setOperationNotice(null);
    setOperationError(false);
    prepareRequestKey.current = null;
    createRequestKey.current = null;
    transitionRequestKeys.current = {};
  }, [searchId]);

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
  const localSummary = useMemo(() => selectedLeads.reduce((summary, lead) => {
    const classification = classifyCampaignLeadLocally(lead).classification;
    summary[classification] += 1;
    return summary;
  }, { automatic: 0, manual: 0, excluded: 0 }), [selectedLeads]);
  const selectableLeadIds = useMemo(() => selectableCampaignLeadIds(leads), [leads]);
  const selectableLeadCount = selectableLeadIds.length;
  const accountConnectionId = account?.connectionId ?? account?.id ?? null;
  const connected = account?.status === 'connected' && Boolean(accountConnectionId);
  const qrExpired = isTelegramAccountQrExpired(account, accountClock);
  const safeQr = qrExpired ? null : safeTelegramQrDataUrl(account?.qr?.qrCodeDataUrl);
  const serverSummary = preparationSummary(preparation);
  const preparationExpired = preparation ? Date.parse(preparation.expiresAt) <= preparationClock : false;
  const createReady = Boolean(
    campaignOutreachEnabled
    && connected
    && contactBasis
    && preparation
    && !preparationExpired
    && serverSummary
    && serverSummary.automatic > 0
    && exactConfirmation
    && !operationBusy,
  );

  function invalidatePreparation(): void {
    setPreparation(null);
    setExactConfirmation(false);
    setOperationNotice(null);
    setOperationError(false);
    prepareRequestKey.current = null;
    createRequestKey.current = null;
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

  function selectAllAvailable(): void {
    if (operationBusy || campaign) return;
    setSelectedLeadIds(new Set(selectableLeadIds.slice(0, LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT)));
    invalidatePreparation();
    if (selectableLeadIds.length > LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT) {
      setOperationError(false);
      setOperationNotice(`Выбраны первые 50 из ${selectableLeadIds.length} компаний. Остальные сохранены в выдаче.`);
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
    } catch (disconnectError) {
      if (hasDefiniteHttpResponse(disconnectError)) disconnectRequestKey.current = null;
      setAccountNotice(campaignErrorCopy(disconnectError));
    } finally {
      setAccountBusy(false);
    }
  }

  async function prepareCampaign(): Promise<void> {
    const accountId = accountConnectionId;
    if (!campaignOutreachEnabled || !connected || !accountId || !contactBasis || operationBusy || selectedLeadIds.size === 0 || !isCampaignTemplateReady(template)) return;
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
      setCampaign(next);
      setStopConfirmation(false);
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
      setCampaign(next);
    } catch (refreshError) {
      setOperationError(true);
      setOperationNotice(campaignErrorCopy(refreshError));
    } finally {
      setOperationBusy(false);
    }
  }

  const preparedAutomaticIds = new Set([
    ...(preparation?.selection?.automaticCompanyIds ?? []),
    ...(preparation?.recipients ?? [])
      .filter((recipient) => recipient.classification === 'automatic')
      .map((recipient) => recipient.leadId),
  ]);
  const previewLeads = preparation
    ? selectedLeads.filter((lead) => preparedAutomaticIds.size > 0
      ? preparedAutomaticIds.has(lead.id)
      : classifyCampaignLeadLocally(lead).classification === 'automatic')
    : selectedLeads;
  const previewItems = preparation?.previews?.length
    ? preparation.previews.slice(0, 3)
    : previewLeads.slice(0, 3).map((lead) => ({
        leadId: lead.id,
        companyName: lead.name,
        text: renderCampaignPreview(template, lead.name),
      }));
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
    && accountStatus !== 'unconfigured'
    && accountStatus !== 'connected'
    && (qrExpired || (accountStatus !== 'pending' && accountStatus !== 'connecting'))
    && accountStatus !== 'paused',
  );

  return (
    <section aria-labelledby={headingId} data-testid="lead-radar-telegram-campaign" className="space-y-4">
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
              <span role="status" aria-live="polite" aria-atomic="true" className="inline-flex min-h-11 items-center gap-2 text-sm text-white/65">
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
          {!campaignAutoSendEnabled && (
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
                    <Button type="button" variant="secondary" disabled={accountLoading || accountBusy} onClick={() => { void loadAccount(); }} className="min-h-11">
                      <RefreshCw size={16} className={accountLoading ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />Статус
                    </Button>
                    {canRequestConnection && (
                      <Button type="button" disabled={accountBusy || accountLoading} aria-busy={accountBusy} onClick={() => { void connectAccount(); }} className="min-h-11">
                        {accountBusy ? <LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : <QrCode size={16} aria-hidden="true" />}
                        {accountBusy ? 'Готовим QR…' : qrExpired ? 'Создать новый QR' : accountStatus === 'disconnected' ? 'Подключить аккаунт' : 'Переподключить'}
                      </Button>
                    )}
                  </div>
                </div>
                {account?.status === 'connected' && (
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/[0.08] p-3">
                      <dt className="text-[10px] uppercase tracking-wide text-white/50">Аккаунт</dt>
                      <dd className="mt-1 text-sm text-white/80">{account.displayName || account.maskedLabel || account.username || 'Подтверждён Telegram'}</dd>
                      {account.username && <dd className="mt-0.5 text-xs text-white/55">@{account.username.replace(/^@/, '')}</dd>}
                    </div>
                    <div className="rounded-xl border border-white/[0.08] p-3">
                      <dt className="text-[10px] uppercase tracking-wide text-white/50">Последняя проверка</dt>
                      <dd className="mt-1 text-sm text-white/80">{formatDate(account.lastHealthAt || account.connectedAt)}</dd>
                      {account.phoneMasked && <dd className="mt-0.5 text-xs text-white/55">{account.phoneMasked}</dd>}
                    </div>
                  </dl>
                )}
                {accountNotice && (
                  <p role="status" aria-live="polite" aria-atomic="true" className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs leading-5 text-amber-50/80">{accountNotice}</p>
                )}
                {account && ['connected', 'restricted', 'reauth_required', 'paused', 'error'].includes(account.status) && !disconnectConfirmation && (
                  <button type="button" disabled={accountBusy || accountLoading} onClick={() => setDisconnectConfirmation(true)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-medium text-white/60 hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-50">
                    <Unplug size={15} aria-hidden="true" />Отключить аккаунт
                  </button>
                )}
                {disconnectConfirmation && (
                  <div role="group" aria-label="Подтверждение отключения Telegram-аккаунта" className="mt-3 rounded-xl border border-rose-300/18 bg-rose-400/[0.045] p-3">
                    <p className="text-xs leading-5 text-rose-50/85">Отключение немедленно блокирует новые отправки и удаляет обратимую серверную сессию.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="danger" disabled={accountBusy || accountLoading} onClick={() => { void disconnectAccount(); }} className="min-h-11">Подтвердить отключение</Button>
                      <Button type="button" variant="secondary" disabled={accountBusy || accountLoading} onClick={() => setDisconnectConfirmation(false)} className="min-h-11">Отмена</Button>
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
                      <p className="mt-1 text-xs leading-5 text-white/60">Создайте новый QR кнопкой рядом. Старый код больше не используется, сообщения не отправлялись.</p>
                    </div>
                  ) : safeQr ? (
                    <div>
                      <img src={safeQr} alt="QR-код для подключения выделенного Telegram-аккаунта" className="mx-auto h-44 w-44 rounded-xl bg-white p-2" />
                      <p className="mt-3 text-xs text-white/60">Действует до {formatDate(account.qr?.expiresAt ?? null)}</p>
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
            <fieldset disabled={operationBusy || Boolean(campaign)} className="min-w-0">
              <legend className="text-sm font-semibold text-white">1. Выберите компании</legend>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-5 text-white/60">Выбрано <span className="font-semibold tabular-nums text-white">{selectedLeadIds.size}/{LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT}</span></p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" disabled={selectableLeadCount === 0 || Boolean(campaign)} onClick={selectAllAvailable} className="min-h-11">
                    <UsersRound size={16} aria-hidden="true" />Выбрать всех найденных
                  </Button>
                  <Button type="button" variant="ghost" disabled={selectedLeadIds.size === 0 || Boolean(campaign)} onClick={() => { setSelectedLeadIds(new Set()); invalidatePreparation(); }} className="min-h-11">Снять выбор</Button>
                </div>
              </div>
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1" aria-label="Компании для Telegram-кампании">
                {leads.map((lead) => {
                  const local = classifyCampaignLeadLocally(lead);
                  const copy = LOCAL_CLASSIFICATION_COPY[local.classification];
                  const selectable = isSelectableCampaignLead(lead);
                  return (
                    <label key={lead.id} className={`flex min-h-12 items-start gap-3 rounded-xl border p-3 transition-colors ${selectable ? 'cursor-pointer border-white/[0.08] hover:bg-white/[0.025]' : 'cursor-not-allowed border-rose-300/10 bg-rose-400/[0.025]'}`}>
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
                      </span>
                      <Badge tone={copy.tone}>{copy.label}</Badge>
                    </label>
                  );
                })}
              </div>
              {leads.length === 0 && <p className="mt-3 rounded-xl border border-dashed border-white/[0.1] p-4 text-sm text-white/55">Сначала дождитесь найденных компаний.</p>}
              <p className="mt-3 text-[11px] leading-5 text-white/55">Метки предварительные. Сервер заново проверит endpoint, DNC, тип аккаунта и доступность перед созданием и перед каждой отправкой.</p>
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
                  disabled={operationBusy || Boolean(campaign)}
                  aria-describedby={composerHelpId}
                  aria-invalid={!isCampaignTemplateReady(template)}
                  onChange={(event) => updateTemplate(event.target.value)}
                  className="min-h-48 resize-y"
                />
                <div id={composerHelpId} className="mt-2 flex flex-col gap-1 text-xs leading-5 text-white/60 sm:flex-row sm:items-center sm:justify-between">
                  <span>Разрешённая переменная: {'{company_name}'}. Точный текст фиксирует сервер.</span>
                  <span className="shrink-0 tabular-nums">{[...template].length}/{LEAD_RADAR_CAMPAIGN_MESSAGE_LIMIT}</span>
                </div>
              </div>

              <div className="mt-4">
                <Label htmlFor={`${composerHelpId}-basis`}>Основание для обращения</Label>
                <Select
                  id={`${composerHelpId}-basis`}
                  value={contactBasis}
                  required
                  disabled={operationBusy || Boolean(campaign)}
                  onChange={(event) => {
                    setContactBasis(event.target.value as LeadRadarCampaignContactBasis | '');
                    invalidatePreparation();
                  }}
                  className="min-h-12"
                >
                  <option value="">Выберите подтверждённое основание</option>
                  {Object.entries(CONTACT_BASIS_COPY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
                <p className="mt-2 text-xs leading-5 text-amber-50/70">Публичный username или телефон не являются согласием и не подходят как основание.</p>
              </div>

              {selectedLeadIds.size > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2" aria-label="Предварительная разбивка выбранных компаний">
                  <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.035] p-3"><div className="text-[10px] uppercase text-white/50">Кандидаты авто</div><div className="mt-1 text-xl font-semibold tabular-nums text-emerald-200">{localSummary.automatic}</div></div>
                  <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-3"><div className="text-[10px] uppercase text-white/50">Вручную</div><div className="mt-1 text-xl font-semibold tabular-nums text-amber-100">{localSummary.manual}</div></div>
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.018] p-3"><div className="text-[10px] uppercase text-white/50">Исключатся</div><div className="mt-1 text-xl font-semibold tabular-nums text-white/75">{localSummary.excluded}</div></div>
                </div>
              )}

              <Button
                type="button"
                size="lg"
                disabled={!campaignOutreachEnabled || !connected || !contactBasis || selectedLeadIds.size === 0 || !isCampaignTemplateReady(template) || operationBusy || Boolean(campaign)}
                aria-busy={operationBusy && !preparation}
                onClick={() => { void prepareCampaign(); }}
                className="mt-4 min-h-12 w-full"
              >
                {operationBusy && !preparation ? <LoaderCircle size={17} className="motion-safe:animate-spin" aria-hidden="true" /> : <ShieldCheck size={17} aria-hidden="true" />}
                Проверить список и текст на сервере
              </Button>
              {!campaignOutreachEnabled
                ? <p className="mt-2 text-xs leading-5 text-amber-50/70">Серверная проверка кампаний ещё не разрешена. Локальный выбор и оффер сохраните в этой вкладке.</p>
                : !connected && <p className="mt-2 text-xs leading-5 text-amber-50/70">Для серверной проверки сначала подключите отдельный аккаунт.</p>}
            </div>
          </div>

          {preparation && serverSummary && !campaign && (
            <div className="rounded-2xl border border-brand-cyan/18 bg-brand-cyan/[0.035] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">3. Серверная проверка</h3>
                  <p className="mt-1 text-xs leading-5 text-white/60">Подтверждение действует до {formatDate(preparation.expiresAt)}. Любое изменение списка или текста аннулирует его.</p>
                </div>
                <Badge tone={preparationExpired ? 'danger' : serverSummary.automatic > 0 ? 'success' : 'warning'}>
                  {preparationExpired ? 'Истекло' : 'Состав зафиксирован'}
                </Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([
                  ['Выбрано', serverSummary.selected],
                  ['Автоматически', serverSummary.automatic],
                  ['Только вручную', serverSummary.manual],
                  ['Исключено', serverSummary.excluded],
                ] as const).map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-white/[0.08] bg-[#05070d]/35 p-3"><dt className="text-[10px] uppercase text-white/50">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-white">{value}</dd></div>
                ))}
              </dl>

              {previewItems.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-white/60">Предпросмотр</h4>
                  <div className="mt-2 grid gap-2 lg:grid-cols-3">
                    {previewItems.map((preview) => (
                      <div key={preview.leadId} className="rounded-xl border border-white/[0.08] bg-[#05070d]/45 p-3">
                        <p className="truncate text-xs font-semibold text-brand-cyan">{preview.companyName}</p>
                        <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-xs leading-5 text-white/65">{preview.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <label className="mt-4 flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-white/[0.1] p-3 text-sm leading-5 text-white/80 hover:bg-white/[0.025]">
                <input
                  type="checkbox"
                  checked={exactConfirmation}
                  disabled={operationBusy || preparationExpired || serverSummary.automatic === 0}
                  onChange={(event) => setExactConfirmation(event.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#2fe6d1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                />
                <span><span className="block font-medium text-white">Подтверждаю точный текст и {serverSummary.automatic} автоматических адресатов</span>Основание: {contactBasis ? CONTACT_BASIS_COPY[contactBasis] : 'не выбрано'}. Публичный Telegram не равен согласию; DNC проверен, а Stop остаётся доступен.</span>
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
                  <h3 className="mt-1 text-base font-semibold text-white">{CAMPAIGN_STATUS_COPY[campaign.status].label}</h3>
                  <p className="mt-1 text-xs leading-5 text-white/60">{CAMPAIGN_STATUS_COPY[campaign.status].detail}</p>
                </div>
                <Badge tone={CAMPAIGN_STATUS_COPY[campaign.status].tone}>{CAMPAIGN_STATUS_COPY[campaign.status].label}</Badge>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-3 text-xs text-white/60">
                  <span>Обработано {progressDone} из {campaign.counts.total}</span>
                  <span className="tabular-nums">{progressPercent}%</span>
                </div>
                <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} aria-label="Прогресс Telegram-кампании" className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]">
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
                {campaign.status === 'approved' && <Button type="button" disabled={operationBusy || !campaignAutoSendEnabled} onClick={() => { void transitionCampaign('start'); }} className="min-h-12"><PlayCircle size={17} aria-hidden="true" />Запустить</Button>}
                {campaign.status === 'running' && <Button type="button" variant="secondary" disabled={operationBusy} onClick={() => { void transitionCampaign('pause'); }} className="min-h-12"><PauseCircle size={17} aria-hidden="true" />Пауза</Button>}
                {campaign.status === 'paused' && <Button type="button" disabled={operationBusy || !campaignAutoSendEnabled} onClick={() => { void transitionCampaign('resume'); }} className="min-h-12"><PlayCircle size={17} aria-hidden="true" />Продолжить</Button>}
                {!isCampaignTerminal(campaign.status) && !stopConfirmation && <Button type="button" variant="danger" disabled={operationBusy} onClick={() => setStopConfirmation(true)} className="min-h-12"><StopCircle size={17} aria-hidden="true" />Остановить</Button>}
                <Button type="button" variant="secondary" disabled={operationBusy} onClick={() => { void refreshCampaign(); }} className="min-h-12"><RefreshCw size={17} className={operationBusy ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />Обновить</Button>
              </div>

              {stopConfirmation && !isCampaignTerminal(campaign.status) && (
                <div role="group" aria-label="Подтверждение остановки кампании" className="mt-3 rounded-xl border border-rose-300/18 bg-rose-400/[0.045] p-3">
                  <p className="text-sm leading-6 text-rose-50/85">Остановка терминальна: уже подтверждённые Telegram сообщения останутся, а все неотправленные адресаты будут отменены.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" variant="danger" disabled={operationBusy} onClick={() => { void transitionCampaign('stop'); }} className="min-h-11">Подтвердить Stop</Button>
                    <Button type="button" variant="secondary" disabled={operationBusy} onClick={() => setStopConfirmation(false)} className="min-h-11">Отмена</Button>
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
