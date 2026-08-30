import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { describeCampaignFailure } from '../../lib/campaign-diagnostics';
import { readCampaignMediaDraft, saveCampaignMediaDraft } from '../../lib/campaign-media-draft';
import { readCampaignBasisDraft, readCampaignTemplateDraft, saveCampaignBasisDraft, saveCampaignTemplateDraft } from '../../lib/campaign-template-draft';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  ImagePlus,
  LoaderCircle,
  MessageCircle,
  PauseCircle,
  PlayCircle,
  Phone,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  StopCircle,
  Trash2,
  Unplug,
  UploadCloud,
  UsersRound,
} from 'lucide-react';
import type { LeadRadarLead, LeadRadarTelegramAccountReadiness } from '../../../shared/lead-radar';
import { AUDIENCE_LIMIT } from '../../../shared/lead-radar-audiences';
import { mobileOrUsernameLeadIds, recipientContactChoices, recipientContactSummary, verifiedTelegramContactChoices, verifiedTelegramContactSummary, verifiedTelegramLeadIds } from '../../../shared/lead-radar-recipient-contacts';
import { api } from '../../lib/api';
import { CampaignReadiness, type CampaignReadinessHandle } from './CampaignReadiness';
import type { LeadRadarCampaignPreflight } from '../../lib/lead-radar-campaign';
import { awaitTelegramPhoneChallenge } from '../../lib/lead-radar-telegram-auth';
import {
  boundCampaignTemplate,
  campaignMessageLimit,
  campaignFromRecovery,
  campaignResumeBlockReason,
  classifyCampaignLeadLocally,
  hasCampaignImageAnimationMarker,
  isCampaignTemplateReady,
  isCampaignDraftCandidateLead,
  isTelegramAccountQrExpired,
  isValidCampaignMediaUpload,
  isValidCampaignRecipientAuthorization,
  LEAD_RADAR_CAMPAIGN_CAPTION_LIMIT,
  LEAD_RADAR_CAMPAIGN_IMAGE_MAX_BYTES,
  LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT,
  renderCampaignPreview,
  safeTelegramLoginUrl,
  telegramAccountQuickAction,
  telegramAuthProgress,
  validateCampaignImage,
  validateCampaignImageDimensions,
  type LeadRadarCampaignImageValidationCode,
  type LeadRadarCampaignContactBasis,
  type LeadRadarCampaignRecipientClassification,
  type LeadRadarTelegramBridgeDeviceState,
  type LeadRadarTelegramBridgePairing,
  type LeadRadarTelegramAccountQr,
  type LeadRadarTelegramAccountState,
  type LeadRadarTelegramCampaignPreparation,
  type LeadRadarTelegramCampaignMutationResponse,
  type LeadRadarTelegramCampaignReadModel,
  type LeadRadarTelegramCampaignMediaUpload,
  type LeadRadarTelegramCampaignStatus,
} from '../../lib/lead-radar-campaign';
import {
  createTelegramBridgeEnrollmentCode,
  decryptTelegramBridgeQrEnvelope,
  encryptTelegramBridgeAuthInput,
  encryptTelegramBridgePassword,
  LEAD_RADAR_TELEGRAM_BRIDGE_PUBLIC_ORIGIN,
  telegramBridgeEnrollmentUri,
  type TelegramBridgeBrowserKey,
  type TelegramBridgeQrPayload,
} from '../../lib/lead-radar-telegram-bridge-crypto';
import { Badge, Button, Card, Input, Label, Select, Textarea } from '../ui';

export interface TelegramAccountCampaignPanelProps {
  onContactsUpdated?: () => void;
  searchId?: string;
  audience?: { audienceId: string; audienceVersion: number };
  initialSelectedLeadIds?: string[];
  excludedRecipientIds?: string[];
  leads: LeadRadarLead[];
  initialTemplate: string;
  telegramAccountEnabled: boolean;
  telegramAccountReadiness?: LeadRadarTelegramAccountReadiness;
  campaignOutreachEnabled: boolean;
  audienceSyncIssue?: string;
  campaignAutoSendEnabled: boolean;
  telegramCampaignDailyLimit: number;
  telegramCampaignMinimumIntervalSeconds: number;
}

const ACCOUNT_STATUS_COPY = {
  unconfigured: { label: 'Нужно подключить Bridge', tone: 'warning' as const, detail: 'Запустите бесплатный локальный Telegram Bridge на этом компьютере и выполните одноразовую привязку.' },
  disconnected: { label: 'Не подключён', tone: 'neutral' as const, detail: 'Подключите выделенный аккаунт. Подключение само по себе не запускает кампанию.' },
  pending: { label: 'Подключение Telegram', tone: 'warning' as const, detail: 'Введите номер, затем код Telegram. Рассылка до завершения входа закрыта.' },
  connecting: { label: 'Подключение Telegram', tone: 'warning' as const, detail: 'Введите номер, затем код Telegram. Рассылка до завершения входа закрыта.' },
  connected: { label: 'Подключён', tone: 'success' as const, detail: 'Аккаунт готов. Для отправки компьютер и локальный Bridge должны оставаться включёнными.' },
  restricted: { label: 'Ограничен Telegram', tone: 'danger' as const, detail: 'Новые отправки остановлены из-за ограничения аккаунта.' },
  reauth_required: { label: 'Нужно переподключение', tone: 'warning' as const, detail: 'Сессия больше не действует. Подключите аккаунт заново.' },
  revoked: { label: 'Доступ отозван', tone: 'danger' as const, detail: 'Telegram отозвал сессию. Кампании не запускаются.' },
  paused: { label: 'На паузе', tone: 'warning' as const, detail: 'Аккаунт сохранён, но новые отправки остановлены защитным переключателем.' },
  error: { label: 'Статус неизвестен', tone: 'danger' as const, detail: 'Сервер не подтвердил состояние аккаунта. Отправка остаётся закрытой.' },
} as const;

const ACCOUNT_READINESS_REASON_COPY: Record<string, string> = {
  tenant_not_allowed: 'Этот владелец ещё не добавлен в разрешённый список Telegram-шлюза. Подключение и отправка закрыты.',
  feature_disabled: 'Подключение Telegram выключено серверным переключателем. QR не создавался и ничего не отправлялось.',
  campaign_data_key_missing: 'На сервере не настроен ключ шифрования данных кампании. Добавьте защищённый секрет и повторите проверку.',
  campaign_data_key_mismatch: 'Ключ шифрования кампании не совпадает с ключом, которым защищён подключённый Telegram-аккаунт. Отправка закрыта: восстановите прежний ключ или безопасно переподключите аккаунт.',
  legacy_binding_required: 'Подключённый Telegram-аккаунт создан до проверки ключа шифрования. Выполните безопасную привязку или переподключение; до этого отправка закрыта.',
  gateway_binding_missing: 'Сайт не связан с бесплатным Telegram-шлюзом. Проверьте Service Binding и повторите проверку.',
  gateway_unavailable: 'Telegram-шлюз временно недоступен. Подключение и отправка не выполнялись; повторите позже.',
  gateway_credentials_missing: 'Локальному Bridge не переданы Telegram API ID и API hash. Добавьте их в защищённую локальную настройку Bridge — в сайт их вставлять нельзя.',
  gateway_account_keys_missing: 'Локальный Bridge не подтвердил защищённое хранилище сессии Windows. Перезапустите Bridge и повторите привязку.',
  gateway_routing_key_mismatch: 'Ключ маршрутизации Telegram изменился после подключения аккаунта. Отправка закрыта: восстановите прежний ключ и безопасно отключите или переподключите аккаунт.',
  gateway_routing_legacy_unbound: 'Telegram-аккаунт подключён до появления проверки ключа маршрутизации. Отправка закрыта до безопасной привязки или переподключения.',
  gateway_account_session_missing: 'Сервер не нашёл защищённую сессию этого Telegram-аккаунта по сохранённому маршруту. Отправка закрыта; проверьте хранилище и выполните безопасное переподключение.',
  gateway_storage_missing: 'Локальное защищённое хранилище Telegram-сессии недоступно. QR и отправка заблокированы.',
  gateway_runtime_config_invalid: 'Конфигурация бесплатного Telegram Bridge неполна или недействительна. Исправьте настройку и повторите проверку.',
  gateway_internal_token_missing: 'Между сайтом и приватным шлюзом не настроена внутренняя подпись. Подключение и отправка закрыты.',
  bridge_transport_mode_invalid: 'Активирован несовместимый транспорт. Для бесплатного режима требуется local_bridge.',
  bridge_not_paired: 'Локальный Bridge ещё не привязан к Lead Radar. Запустите его и введите одноразовый код с этого экрана.',
  bridge_offline: 'Локальный Bridge не отвечает. Запустите программу на компьютере; ничего не отправлено.',
  bridge_revocation_pending: 'Bridge ещё подтверждает локальное удаление Telegram-сессии. Новое подключение и отправка закрыты до подтверждения.',
};

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
  missing_telegram: 'Не будет отправлено — сначала нужен проверенный Telegram-контакт.',
  unsupported_telegram_type: 'Не будет отправлено — бот, канал или группа не подходят для личного обращения.',
  do_not_contact: 'Компания находится в списке «Не связываться».',
} as const;

const SERVER_REASON_COPY: Record<string, string> = {
  verified_corporate_endpoint: 'Telegram компании подтверждён, но отдельная запись основания ещё нужна.',
  verified_corporate_authorized: 'Корпоративный Telegram и отдельная запись основания подтверждены сервером.',
  documented_basis_required: 'Для этой компании нет действующей записи документированного основания.',
  documented_contact_basis_missing: 'Нет подтверждённого основания именно для этой компании.',
  contact_basis_expired: 'Срок подтверждённого основания истёк.',
  personal_contact_manual_only: 'Личный или неподтверждённый контакт — только ручная проверка.',
  bot_not_messageable: 'Бот нельзя использовать как адресата кампании.',
  channel_not_messageable: 'Канал нельзя использовать как адресата личного сообщения.',
  group_not_messageable: 'Группу нельзя использовать как адресата личного сообщения.',
  no_verified_corporate_endpoint: 'Telegram ещё не подтверждён. Если номер найден, выполните подготовку и посмотрите результат проверки выше.',
  corporate_endpoint_unverified: 'Telegram компании найден, но подтверждений недостаточно.',
  do_not_contact: 'Компания находится в списке «Не связываться».',
  already_contacted: 'Исключён — этой компании уже успешно отправлялось сообщение в предыдущей кампании.',
  previous_delivery_uncertain: 'Исключён — итог предыдущей отправки неизвестен. Сначала проверьте чат вручную, чтобы не написать повторно.',
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

type CampaignMediaState = 'idle' | 'validating' | 'ready' | 'uploading' | 'checking' | 'uploaded' | 'removing' | 'error';

const CAMPAIGN_IMAGE_VALIDATION_COPY: Record<LeadRadarCampaignImageValidationCode, string> = {
  empty: 'Файл пустой. Выберите другое изображение.',
  unsupported_type: 'Поддерживаются только JPEG, PNG и WebP.',
  too_large: 'Изображение превышает лимит 5 МБ. Уменьшите файл и выберите его заново.',
  invalid_dimensions: 'Telegram не принимает это разрешение или пропорции. Сумма ширины и высоты должна быть не больше 10 000 px, а соотношение сторон — не больше 20:1.',
  animated: 'Анимированные PNG и WebP не поддерживаются. Сохраните один статичный кадр.',
};

function formatImageSize(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} КБ`;
  return `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} МБ`;
}

async function inspectCampaignImage(file: File): Promise<LeadRadarCampaignImageValidationCode | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (hasCampaignImageAnimationMarker(bytes, file.type)) return 'animated';
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      try {
        return validateCampaignImageDimensions(bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
    } catch {
      return 'invalid_dimensions';
    }
  }
  return new Promise((resolve) => {
    const previewUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(previewUrl);
      resolve(validateCampaignImageDimensions(image.naturalWidth, image.naturalHeight));
    };
    image.onerror = () => {
      URL.revokeObjectURL(previewUrl);
      resolve('invalid_dimensions');
    };
    image.src = previewUrl;
  });
}

function campaignMediaErrorCopy(error: unknown): string {
  return describeCampaignFailure(error, campaignMediaErrorMessage(error));
}

function campaignMediaErrorMessage(error: unknown): string {
  const details = error as Error & { code?: string; status?: number };
  if (details.code === 'telegram_campaign_media_type_invalid' || details.status === 415) return CAMPAIGN_IMAGE_VALIDATION_COPY.unsupported_type;
  if (details.code === 'telegram_campaign_media_too_large' || details.status === 413) return CAMPAIGN_IMAGE_VALIDATION_COPY.too_large;
  if (details.code === 'telegram_campaign_media_dimensions_invalid') return CAMPAIGN_IMAGE_VALIDATION_COPY.invalid_dimensions;
  if (details.code === 'telegram_campaign_media_animated') return CAMPAIGN_IMAGE_VALIDATION_COPY.animated;
  if (details.code === 'telegram_campaign_media_invalid') return 'Сервер не распознал изображение. Пересохраните его как статичный JPEG, PNG или WebP.';
  if (details.code === 'telegram_campaign_media_idempotency_conflict') return 'Файл изменился во время повторной загрузки. Выберите изображение заново.';
  if (details.code === 'telegram_campaign_media_in_use') return 'Изображение уже закреплено за проверенной кампанией и пока не может быть удалено.';
  if (details.code === 'telegram_campaign_media_quota_exceeded') return 'Безопасный лимит хранилища достигнут. Удалите старый макет или дождитесь автоматической очистки; ничего не отправлено.';
  if (details.code === 'telegram_campaign_media_storage_unavailable' || details.status === 503) return 'Хранилище изображений временно недоступно. Ничего не отправлено — повторите позже.';
  if (details.status === 404) return 'Серверный контур изображений ещё не подключён. Файл остался только на устройстве, ничего не отправлено.';
  if (details.code === 'UNAUTHENTICATED') return 'Сессия завершилась. Войдите в панель снова.';
  return 'Не удалось безопасно обработать изображение. Ничего не отправлено; можно повторить загрузку.';
}

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
  return describeCampaignFailure(error, campaignErrorMessage(error));
}

function campaignErrorMessage(error: unknown): string {
  const details = error as Error & { code?: string; status?: number; retryAfterSeconds?: number };
  if (details.code?.startsWith('audience_')) return 'Аудитория изменилась или один из её контактов больше не допускается. Обновите аудиторию в общей базе и выполните проверку заново. Ничего не отправлено.';
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
  if (details.code === 'telegram_campaign_auth_rate_limited') {
    return 'Слишком много попыток ввода пароля. Подождите и повторите позже; пароль не сохранён.';
  }
  if (details.code === 'telegram_bridge_preparation_timeout') return 'Bridge не завершил подготовку нового входа за 45 секунд. Номер и запрос кода не отправлялись. Проверьте Bridge и попробуйте ещё раз.';
  if (details.code === 'telegram_auth_expired') return 'Срок подключения истёк. Начните новое подключение; код не запрашивался.';
  if (details.code === 'telegram_auth_state_changed') return 'Состояние входа изменилось. Нажмите «Статус», чтобы продолжить текущий шаг. Повторный код не запрашивался.';
  if (details.code === 'telegram_auth_cancelled') return 'Ожидание подключения отменено. Код не запрашивался.';
  if (details.code === 'telegram_campaign_recipient_limit') return 'В одной кампании можно выбрать не более 50 компаний.';
  if (details.code === 'lead_radar_contact_paused') return 'Контактный контур выключен. Кампания не запущена.';
  if (details.code === 'UNAUTHENTICATED') return 'Сессия завершилась. Войдите в панель снова.';
  if (details.status === 404 || details.status === 503) return 'Сервер не завершил этот этап. Код ошибки и номер запроса ниже помогут определить причину. Не переподключайте аккаунт вслепую.';
  return 'Сервер не подтвердил операцию. Ничего не повторяется автоматически — обновите статус перед новой попыткой.';
}

function hasDefiniteHttpResponse(error: unknown): boolean {
  return typeof (error as { status?: unknown })?.status === 'number';
}

function TelegramTwoFactorPasswordForm({
  challenge,
  disabled,
  onBusyChange,
  onResolved,
}: {
  challenge: LeadRadarTelegramAccountQr;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onResolved: (account: LeadRadarTelegramAccountState) => void;
}) {
  const authId = challenge.authId;
  const passwordId = useId();
  const helpId = useId();
  const errorId = useId();
  // This is the sole password copy owned by the UI. The form is keyed by the
  // short-lived auth id and unmounts on terminal state, discarding its state.
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPassword('');
    setError(null);
  }, [authId]);

  async function submitPassword(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || disabled || password.length < 1) return;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    const encryptionKey = challenge.bridgeEncryptionKey;
    const passwordCommandId = challenge.passwordCommandId;
    if (!encryptionKey || !passwordCommandId) {
      setPassword('');
      setError('Локальный Bridge не вернул одноразовый ключ для 2FA. Обновите статус; пароль никуда не отправлен.');
      setBusy(false);
      onBusyChange(false);
      return;
    }
    // Encrypt on this device before constructing the HTTP request. Pages and
    // Cloudflare receive only ciphertext; the controlled field is cleared as
    // soon as the one-use envelope has been created.
    const plaintext = password;
    setPassword('');
    try {
      const passwordEnvelope = await encryptTelegramBridgePassword({
        bridgePublicKeySpki: encryptionKey.spki,
        keyId: encryptionKey.keyId,
        password: plaintext,
        orgId: challenge.orgId,
        deviceId: challenge.deviceId,
        commandId: passwordCommandId,
        authId,
        expiresAt: challenge.expiresAt,
      });
      const next = await api.leadRadarSubmitTelegramAccountPassword(authId, {
        passwordCommandId,
        passwordEnvelope,
      });
      onResolved(next);
      if (next.authState === 'awaiting_password' && !next.pendingAction) {
        setError(next.reasonCode === 'password_invalid'
          ? 'Telegram отклонил пароль. Проверьте его и попробуйте снова.'
          : next.reasonCode === 'bridge_password_input_rejected'
            ? 'Пароль не дошёл до Telegram из-за просроченного защищённого конверта. Введите пароль ещё раз.'
            : 'Telegram всё ещё ожидает пароль двухэтапной защиты.');
      }
    } catch (passwordError) {
      setError(campaignErrorCopy(passwordError));
    } finally {
      setPassword('');
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <form onSubmit={(event) => { void submitPassword(event); }} className="w-full max-w-sm text-left">
      <ShieldCheck size={36} className="mx-auto text-brand-cyan" aria-hidden="true" />
      <h4 className="mt-3 text-center text-sm font-semibold text-white">Нужен пароль Telegram 2FA</h4>
      <p id={helpId} className="mt-1 text-center text-xs leading-5 text-white/60">
        Пароль шифруется в этой вкладке одноразовым ключом локального Bridge. Сайт и Cloudflare получают только шифротекст и не сохраняют пароль.
      </p>
      <Label htmlFor={passwordId} className="mt-4">Пароль двухэтапной защиты</Label>
      <Input
        id={passwordId}
        name="telegram-two-factor-password"
        type="password"
        value={password}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        required
        disabled={busy || disabled}
        aria-describedby={`${helpId}${error ? ` ${errorId}` : ''}`}
        aria-errormessage={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        onChange={(event) => {
          setPassword(event.target.value);
          if (error) setError(null);
        }}
        className="min-h-12"
      />
      <Button
        type="submit"
        disabled={busy || disabled || password.length < 1}
        aria-busy={busy}
        className="mt-3 min-h-12 w-full"
      >
        {busy ? <LoaderCircle size={17} className="motion-safe:animate-spin" aria-hidden="true" /> : <ShieldCheck size={17} aria-hidden="true" />}
        {busy ? 'Проверяем пароль…' : 'Подтвердить пароль'}
      </Button>
      {error && (
        <p id={errorId} role="alert" aria-live="assertive" aria-atomic="true" className="mt-3 rounded-xl border border-amber-300/18 bg-amber-300/[0.04] p-3 text-xs leading-5 text-amber-50/90">
          {error}
        </p>
      )}
    </form>
  );
}

function TelegramPhoneAuthForm({
  challenge,
  disabled,
  pending,
  onBusyChange,
  onResolved,
}: {
  challenge: LeadRadarTelegramAccountQr | null;
  disabled: boolean;
  pending: boolean;
  onBusyChange: (busy: boolean) => void;
  onResolved: (account: LeadRadarTelegramAccountState) => void;
}) {
  const action = challenge?.inputAction ?? 'phone';
  const fieldId = useId();
  const helpId = useId();
  const errorId = useId();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const preparationRequest = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { preparationRequest.current?.abort(); }, [challenge?.authId, action]);

  useEffect(() => {
    setValue('');
    setError(null);
  }, [action]);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || disabled || pending || !challenge) return;
    let normalized = value.trim();
    if (action === 'phone') {
      normalized = normalized.replace(/[\s()-]/gu, '');
      if (normalized.startsWith('00')) normalized = `+${normalized.slice(2)}`;
      else if (/^\d{7,15}$/u.test(normalized)) normalized = `+${normalized}`;
      if (!/^\+[1-9]\d{6,14}$/u.test(normalized)) {
        setError('Введите номер с кодом страны, например +998 90 123 45 67.');
        return;
      }
    } else {
      normalized = normalized.replace(/\s/gu, '');
      if (!/^[0-9A-Za-z_-]{3,16}$/u.test(normalized)) {
        setError('Введите код из сообщения Telegram.');
        return;
      }
    }
    setBusy(true);
    onBusyChange(true);
    setError(null);
    const request = new AbortController();
    preparationRequest.current = request;
    try {
      let ready = challenge;
      if (action === 'phone' && (!ready.inputCommandId || !ready.bridgeEncryptionKey)) {
        setPreparing(true);
        const recovered = await awaitTelegramPhoneChallenge(challenge, api.leadRadarTelegramAccountConnectStatus, { signal: request.signal });
        ready = recovered.qr;
        onResolved(recovered);
        setPreparing(false);
      }
      const encryptionKey = ready.bridgeEncryptionKey;
      const inputCommandId = ready.inputCommandId;
      if (!encryptionKey || !inputCommandId) throw Object.assign(new Error('missing_channel'), { code: 'telegram_auth_state_changed' });
      if (request.signal.aborted) return;
      const inputEnvelope = await encryptTelegramBridgeAuthInput({
        bridgePublicKeySpki: encryptionKey.spki,
        keyId: encryptionKey.keyId,
        action,
        value: normalized,
        orgId: ready.orgId,
        deviceId: ready.deviceId,
        commandId: inputCommandId,
        authId: ready.authId,
        expiresAt: ready.expiresAt,
      });
      if (request.signal.aborted) return;
      const next = await api.leadRadarSubmitTelegramAccountAuthInput(ready.authId, {
        inputCommandId,
        inputAction: action,
        inputEnvelope,
      });
      onResolved(next);
      setValue('');
      if (next.reasonCode === 'phone_invalid') setError('Telegram не принял этот номер. Проверьте код страны и номер.');
      if (next.reasonCode === 'code_invalid') setError('Telegram не принял код. Введите последний полученный код ещё раз.');
    } catch (submitError) {
      setError(campaignErrorCopy(submitError));
    } finally {
      preparationRequest.current = null;
      setPreparing(false);
      setBusy(false);
      onBusyChange(false);
    }
  }

  const phoneStep = action === 'phone';
  return (
    <form onSubmit={(event) => { void submit(event); }} className="w-full max-w-sm text-left">
      <Phone size={36} className="mx-auto text-brand-cyan" aria-hidden="true" />
      <h4 className="mt-3 text-center text-sm font-semibold text-white">
        {phoneStep ? 'Введите номер Telegram' : 'Введите код из Telegram'}
      </h4>
      <p id={helpId} className="mt-1 text-center text-xs leading-5 text-white/60">
        {phoneStep
          ? 'Укажите номер с кодом страны. Он зашифруется в этой вкладке и попадёт только в локальный Bridge.'
          : 'Telegram подтвердил запрос кода. Проверьте служебный чат Telegram на устройстве, где вы уже вошли, или SMS. Код не сохраняется сайтом.'}
      </p>
      {!phoneStep && (
        <a
          href="tg://resolve?domain=Telegram"
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-brand-cyan/30 bg-brand-cyan/[0.07] px-4 py-2 text-sm font-semibold text-white hover:bg-brand-cyan/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
        >
          <ExternalLink size={16} aria-hidden="true" />Открыть Telegram за кодом
        </a>
      )}
      <Label htmlFor={fieldId} className="mt-4">{phoneStep ? 'Номер телефона' : 'Код подтверждения'}</Label>
      <Input
        id={fieldId}
        name={phoneStep ? 'telegram-phone' : 'telegram-one-time-code'}
        type="text"
        inputMode={phoneStep ? 'tel' : 'numeric'}
        autoComplete={phoneStep ? 'tel' : 'one-time-code'}
        value={value}
        placeholder={phoneStep ? '+998 90 123 45 67' : '12345'}
        required
        disabled={busy || pending}
        aria-describedby={`${helpId}${error ? ` ${errorId}` : ''}`}
        aria-errormessage={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        onChange={(event) => { setValue(event.target.value); if (error) setError(null); }}
        className="min-h-12"
      />
      <Button type="submit" disabled={busy || disabled || pending || !challenge || value.trim().length < 3} aria-busy={busy || pending} className="mt-3 min-h-12 w-full">
        {busy || pending ? <LoaderCircle size={17} className="motion-safe:animate-spin" aria-hidden="true" /> : <ShieldCheck size={17} aria-hidden="true" />}
        {preparing ? 'Ждём готовность Bridge…' : busy || pending ? (phoneStep ? 'Запрашиваем код у Telegram…' : 'Проверяем код…') : (phoneStep ? 'Получить код' : 'Подтвердить код')}
      </Button>
      {phoneStep && !challenge?.inputCommandId && <p role="status" className="mt-2 text-xs leading-5 text-white/60">Введите номер и нажмите «Получить код». Проверим готовность Bridge; ожидание — не более 20 секунд после нажатия.</p>}
      {error && <p id={errorId} role="alert" className="mt-3 rounded-xl border border-amber-300/18 bg-amber-300/[0.04] p-3 text-xs leading-5 text-amber-50/90">{error}</p>}
    </form>
  );
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
  onContactsUpdated,
  searchId: sourceSearchId,
  audience,
  initialSelectedLeadIds,
  excludedRecipientIds,
  leads,
  initialTemplate,
  telegramAccountEnabled,
  telegramAccountReadiness,
  campaignOutreachEnabled,
  audienceSyncIssue,
  campaignAutoSendEnabled,
  telegramCampaignDailyLimit,
  telegramCampaignMinimumIntervalSeconds,
}: TelegramAccountCampaignPanelProps) {
  // UI lifetime key only; the API receives an explicit search OR audience scope.
  const searchId = sourceSearchId ?? audience?.audienceId ?? '';
  const audienceId = audience?.audienceId;
  const campaignSource = audience ?? { searchId: sourceSearchId };
  const initialSelection = useRef(initialSelectedLeadIds ?? []);
  initialSelection.current = initialSelectedLeadIds ?? [];
  const readinessRef = useRef<CampaignReadinessHandle>(null);
  const preparationInFlight = useRef(false);
  const preparationCancelled = useRef(false);
  const createInFlight = useRef(false);
  const panelMounted = useRef(true);
  const initialTemplateRef = useRef(initialTemplate);
  initialTemplateRef.current = initialTemplate;
  const headingId = useId();
  const composerHelpId = useId();
  const resumeHelpId = useId();
  const connectButtonId = useId();
  const disconnectButtonId = useId();
  const stopButtonId = useId();
  const campaignStateHeadingId = useId();
  const accountQuickStatusId = useId();
  const accountSetupNoticeId = useId();
  const bulkSelectionStatusId = useId();
  const accountSectionId = useId();
  const selectionSectionId = useId();
  const imageInputId = useId();
  const imageHelpId = useId();
  const imageStatusId = useId();
  const [account, setAccount] = useState<LeadRadarTelegramAccountState | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountClock, setAccountClock] = useState(() => Date.now());
  const [accountBusy, setAccountBusy] = useState(false);
  const [connectStarting, setConnectStarting] = useState(false);
  const accountMutationEpoch = useRef(0);
  const accountMutationBusy = useRef(false);
  const changeAccountBusy = useCallback((busy: boolean) => {
    accountMutationEpoch.current += 1;
    accountMutationBusy.current = busy;
    setAccountBusy(busy);
  }, []);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const [accountSetupNoticeVisible, setAccountSetupNoticeVisible] = useState(false);
  const [accountIdentityConfirmed, setAccountIdentityConfirmed] = useState(false);
  const [decryptedQr, setDecryptedQr] = useState<TelegramBridgeQrPayload | null>(null);
  const [bridgeDevice, setBridgeDevice] = useState<LeadRadarTelegramBridgeDeviceState | null>(null);
  const [bridgePairing, setBridgePairing] = useState<(LeadRadarTelegramBridgePairing & {
    enrollmentUri: string;
    enrollmentCode: string;
  }) | null>(null);
  const [bridgePairingBusy, setBridgePairingBusy] = useState(false);
  const [bridgePairingNotice, setBridgePairingNotice] = useState<string | null>(null);
  const [bridgePairingClock, setBridgePairingClock] = useState(() => Date.now());
  const [bridgeRevokeConfirmation, setBridgeRevokeConfirmation] = useState(false);
  const [disconnectConfirmation, setDisconnectConfirmation] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(() => new Set(initialSelection.current));
  // Audit CP-3: the operator's draft must survive a page reload. The tab-scoped
  // draft helper keeps the last edited template; the per-search initialTemplate
  // is only a fallback for first visits. Polling never writes here, so user
  // text wins.
  const [template, setTemplate] = useState(() => {
    const stored = readCampaignTemplateDraft(searchId);
    return boundCampaignTemplate(stored ?? initialTemplate);
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [previewRetry, setPreviewRetry] = useState(0);
  const [previewIssue, setPreviewIssue] = useState(false);
  const [uploadedMedia, setUploadedMedia] = useState<LeadRadarTelegramCampaignMediaUpload | null>(null);
  const [mediaState, setMediaState] = useState<CampaignMediaState>('idle');
  const [mediaProgress, setMediaProgress] = useState(0);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const [imageDragActive, setImageDragActive] = useState(false);
  const [contactBasis, setContactBasis] = useState<LeadRadarCampaignContactBasis | ''>(() => readCampaignBasisDraft(searchId));
  const [authorizationLeadId, setAuthorizationLeadId] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [evidenceExpiresAt, setEvidenceExpiresAt] = useState('');
  const [evidenceAttested, setEvidenceAttested] = useState(false);
  const [authorizationBusy, setAuthorizationBusy] = useState(false);
  const [authorizationNotice, setAuthorizationNotice] = useState<string | null>(null);
  const [authorizationError, setAuthorizationError] = useState(false);
  const [authorizedLeadIds, setAuthorizedLeadIds] = useState<Set<string>>(() => new Set());
  const [serverSelection, setServerSelection] = useState<LeadRadarCampaignPreflight | null>(null);
  const [preparation, setPreparation] = useState<LeadRadarTelegramCampaignPreparation | null>(null);
  const [preparationClock, setPreparationClock] = useState(() => Date.now());
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
  const accountSectionRef = useRef<HTMLDivElement | null>(null);
  const selectionSectionRef = useRef<HTMLFieldSetElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const accountSetupNoticeRef = useRef<HTMLDivElement | null>(null);
  const disconnectConfirmationRef = useRef<HTMLDivElement | null>(null);
  const stopConfirmationRef = useRef<HTMLDivElement | null>(null);
  const connectRequestKey = useRef<string | null>(null);
  const bridgeBrowserKey = useRef<TelegramBridgeBrowserKey | null>(null);
  const bridgeQrDecryptSequence = useRef(0);
  const bridgePairingRequest = useRef<{
    operationId: string;
    enrollmentCode: string;
  } | null>(null);
  const bridgeRevokeRequestKey = useRef<string | null>(null);
  const disconnectRequestKey = useRef<string | null>(null);
  const prepareRequestKey = useRef<string | null>(null);
  const preparedCompanyIds = useRef<string[]>([]);
  const createRequestKey = useRef<string | null>(null);
  const mediaUploadRequestKey = useRef<string | null>(null);
  const mediaValidationSequence = useRef(0);
  const mediaUploadSequence = useRef(0);
  const mediaUploadAbortController = useRef<AbortController | null>(null);
  const mediaCheckStartedAt = useRef(0);
  const currentSearchId = useRef(searchId);
  const authorizationRequest = useRef<{ fingerprint: string; key: string } | null>(null);
  const transitionRequestKeys = useRef<Partial<Record<'start' | 'pause' | 'resume' | 'stop', string>>>({});
  const recoveryRequestSequence = useRef(0);
  currentSearchId.current = searchId;
  useEffect(() => { panelMounted.current = true; return () => {
    panelMounted.current = false;
    mediaUploadAbortController.current?.abort();
    mediaValidationSequence.current += 1;
  }; }, []);

  const clearBridgeBrowserCeremony = useCallback(() => {
    bridgeQrDecryptSequence.current += 1;
    bridgeBrowserKey.current = null;
    setDecryptedQr(null);
  }, []);

  const loadAccount = useCallback(async (): Promise<LeadRadarTelegramAccountState | null> => {
    if (!telegramAccountEnabled) return null;
    const epoch = accountMutationEpoch.current;
    setAccountLoading(true);
    try {
      const next = await api.leadRadarTelegramAccount();
      if (epoch !== accountMutationEpoch.current) return null;
      setAccountClock(Date.now());
      setAccount(next);
      setAccountNotice(null);
      return next;
    } catch (statusError) {
      if (epoch !== accountMutationEpoch.current) return null;
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

  const loadBridgeDevice = useCallback(async (): Promise<LeadRadarTelegramBridgeDeviceState | null> => {
    if (!telegramAccountEnabled) return null;
    try {
      const next = await api.leadRadarTelegramBridgeStatus();
      setBridgeDevice(next);
      return next;
    } catch (bridgeError) {
      setBridgePairingNotice(campaignErrorCopy(bridgeError));
      return null;
    }
  }, [telegramAccountEnabled]);

  const recoverCampaign = useCallback(async (): Promise<LeadRadarTelegramCampaignReadModel | null> => {
    if (!telegramAccountEnabled) return null;
    const requestSequence = ++recoveryRequestSequence.current;
    setCampaignRecovering(true);
    setCampaignRecoveryIssue(null);
    try {
      const response = await api.leadRadarTelegramCampaignRecovery(searchId, audienceId);
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
  }, [searchId, audienceId, telegramAccountEnabled]);

  useEffect(() => {
    if (!telegramAccountEnabled) {
      setAccount(null);
      setAccountNotice(null);
      setBridgeDevice(null);
      setBridgePairing(null);
      setBridgePairingNotice(null);
      setBridgeRevokeConfirmation(false);
      bridgePairingRequest.current = null;
      clearBridgeBrowserCeremony();
      return;
    }
    void loadAccount();
    void loadBridgeDevice();
  }, [telegramAccountEnabled, loadAccount, loadBridgeDevice, clearBridgeBrowserCeremony]);

  useEffect(() => () => {
    // The private CryptoKey and decrypted QR are deliberately browser-memory
    // only. Dropping the last reference makes refresh/unmount fail closed.
    bridgeQrDecryptSequence.current += 1;
    bridgeBrowserKey.current = null;
  }, []);

  useEffect(() => {
    setBridgeRevokeConfirmation(false);
    bridgeRevokeRequestKey.current = null;
  }, [bridgeDevice?.deviceId]);

  useEffect(() => {
    if (!telegramAccountEnabled || !bridgePairing) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    const deadline = Date.parse(bridgePairing.expiresAt);
    const poll = async (): Promise<void> => {
      setBridgePairingClock(Date.now());
      const device = await loadBridgeDevice();
      if (cancelled) return;
      if (device?.deviceId && device.status === 'online') {
        bridgePairingRequest.current = null;
        setBridgePairing(null);
        setBridgePairingNotice('Локальный Bridge подтвердил новую привязку heartbeat-запросом. Теперь можно войти по номеру телефона.');
        await loadAccount();
        return;
      }
      if (device?.deviceId) {
        // Registration alone is not proof that the native client persisted
        // its signed credential. Keep the ceremony visible until the first
        // authenticated heartbeat from this newly registered installation.
        setBridgePairingNotice('Код принят сервером. Ждём первый защищённый heartbeat от Bridge; окно и код пока остаются на экране.');
      } else if (Date.now() >= deadline) {
        bridgePairingRequest.current = null;
        setBridgePairing(null);
        setBridgePairingNotice('Срок одноразовой привязки истёк. Создайте новый код; Telegram-аккаунт не подключался.');
        return;
      }
      timer = window.setTimeout(() => { void poll(); }, 3_000);
    };
    timer = window.setTimeout(() => { void poll(); }, 1_000);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [bridgePairing, loadAccount, loadBridgeDevice, telegramAccountEnabled]);

  useEffect(() => {
    const challenge = account?.qr;
    const active = account?.status === 'connecting' || account?.status === 'pending';
    if (!active) {
      clearBridgeBrowserCeremony();
      return undefined;
    }
    if (!challenge) {
      setDecryptedQr(null);
      return undefined;
    }
    if (Date.parse(challenge.expiresAt) <= accountClock) {
      clearBridgeBrowserCeremony();
      return undefined;
    }
    if (!challenge.qrEnvelope) return undefined;
    const key = bridgeBrowserKey.current;
    if (!key || Date.parse(key.expiresAt) <= accountClock) {
      setDecryptedQr(null);
      setAccountNotice('Ключ этой QR-сессии отсутствует в памяти вкладки. Отмените подключение и создайте новый QR; ничего не отправлено.');
      return undefined;
    }
    const sequence = ++bridgeQrDecryptSequence.current;
    let cancelled = false;
    void decryptTelegramBridgeQrEnvelope({
      browserKey: key,
      envelope: challenge.qrEnvelope,
      orgId: challenge.orgId,
      deviceId: challenge.deviceId,
      commandId: challenge.bridgeCommandId,
      authId: challenge.authId,
      now: new Date(accountClock),
    }).then((qr) => {
      if (cancelled || sequence !== bridgeQrDecryptSequence.current) return;
      setDecryptedQr(qr);
      setAccountNotice(null);
    }).catch(() => {
      if (cancelled || sequence !== bridgeQrDecryptSequence.current) return;
      setDecryptedQr(null);
      setAccountNotice('Зашифрованный QR не прошёл проверку контекста или срока. Создайте новый QR; ничего не отправлено.');
    });
    return () => {
      cancelled = true;
    };
  }, [
    account?.qr,
    account?.status,
    accountClock,
    clearBridgeBrowserCeremony,
  ]);

  useEffect(() => {
    const authId = account?.status === 'connecting' || account?.status === 'pending'
      ? account?.authAttemptId ?? account?.qr?.authId
      : null;
    if (!telegramAccountEnabled || !authId) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    const challengeExpiresAt = Date.parse(account?.qr?.expiresAt ?? '');
    const deadline = Number.isFinite(challengeExpiresAt)
      ? Math.min(Date.now() + 15 * 60_000, challengeExpiresAt)
      : Date.now() + 2 * 60_000;
    const poll = async (): Promise<void> => {
      if (Date.now() >= deadline) {
        setAccountClock(Date.now());
        setAccountNotice('Время ожидания входа истекло. Обновите статус или отмените подключение и начните заново. Рассылка не запускалась.');
        return;
      }
      if (accountMutationBusy.current) {
        timer = window.setTimeout(() => { void poll(); }, 2_000);
        return;
      }
      const epoch = accountMutationEpoch.current;
      try {
        const next = await api.leadRadarTelegramAccountConnectStatus(authId);
        if (cancelled) return;
        if (epoch === accountMutationEpoch.current) {
          setAccountClock(Date.now());
          setAccount(next);
          setAccountNotice(null);
          if (next.status !== 'connecting' && next.status !== 'pending') return;
        }
      } catch (pollError) {
        if (cancelled) return;
        if (epoch === accountMutationEpoch.current) setAccountNotice(campaignErrorCopy(pollError));
      }
      const remaining = Math.max(0, deadline - Date.now() + 50);
      timer = window.setTimeout(() => { void poll(); }, Math.min(2_000, remaining));
    };
    const firstDelay = Math.max(0, deadline - Date.now() + 50);
    timer = window.setTimeout(() => { void poll(); }, Math.min(3_000, firstDelay));
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [account?.authAttemptId, account?.qr?.authId, account?.qr?.expiresAt, account?.status, telegramAccountEnabled]);

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
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const previewMediaId = uploadedMedia?.mediaId;
  const previewMediaDigest = uploadedMedia?.mediaDigest;
  useEffect(() => {
    if (imageFile || !previewMediaId || !previewMediaDigest) return;
    let active = true;
    const controller = new AbortController();
    setPreviewIssue(false);
    void api.leadRadarPreviewTelegramCampaignImage({ mediaId: previewMediaId, mediaDigest: previewMediaDigest }, controller.signal)
      .then((blob) => { if (active) setImagePreviewUrl(URL.createObjectURL(blob)); })
      .catch(() => { if (active) setPreviewIssue(true); });
    return () => { active = false; controller.abort(); };
  }, [searchId, previewMediaId, previewMediaDigest, imageFile, previewRetry]);

  useEffect(() => {
    mediaUploadSequence.current += 1;
    mediaUploadAbortController.current?.abort();
    mediaUploadAbortController.current = null;
    setSelectedLeadIds(new Set(initialSelection.current));
    setTemplate(boundCampaignTemplate(readCampaignTemplateDraft(searchId) ?? initialTemplateRef.current));
    setContactBasis(readCampaignBasisDraft(searchId));
    setPreparation(null);
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
    mediaValidationSequence.current += 1;
    setImageFile(null);
    setImagePreviewUrl(null);
    const restoredMedia = readCampaignMediaDraft(audienceId ?? searchId);
    setUploadedMedia(restoredMedia);
    setMediaState(restoredMedia ? 'checking' : 'idle');
    mediaCheckStartedAt.current = Date.now();
    setMediaProgress(0);
    setMediaNotice(restoredMedia ? 'Восстанавливаем проверку сохранённого изображения…' : null);
    setMediaError(false);
    setImageDragActive(false);
    if (imageInputRef.current) imageInputRef.current.value = '';
    prepareRequestKey.current = null;
    createRequestKey.current = null;
    mediaUploadRequestKey.current = null;
    authorizationRequest.current = null;
    transitionRequestKeys.current = {};
  }, [searchId, audienceId]);

  useEffect(() => {
    if (mediaState !== 'checking' || !uploadedMedia) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const reference = { mediaId: uploadedMedia.mediaId, mediaDigest: uploadedMedia.mediaDigest };
    const check = async () => {
      try {
        const next = await api.leadRadarCheckTelegramCampaignImage(reference);
        if (!active) return;
        if (!isValidCampaignMediaUpload(next) || next.mediaId !== reference.mediaId || next.mediaDigest !== reference.mediaDigest) {
          throw Object.assign(new Error('Invalid media validation state'), { status: 502 });
        }
        if (next.validation?.status === 'pending') {
          if (Date.now() - mediaCheckStartedAt.current > 120_000) {
            setMediaState('error');
            setMediaError(true);
            setMediaNotice('Изображение сохранено, но Bridge пока не завершил проверку. Запустите Bridge и нажмите «Продолжить проверку» — повторная загрузка не нужна.');
            return;
          }
          setMediaNotice(next.validation.reason === 'bridge_offline'
            ? 'Изображение сохранено. Ждём локальный Bridge; откройте программу на компьютере.'
            : 'Изображение сохранено. Bridge проверяет его в фоне; повторно загружать файл после обновления страницы не нужно.');
          timer = setTimeout(() => { void check(); }, next.validation.retryAfterSeconds * 1000);
          return;
        }
        if (next.validation?.status === 'invalid') throw Object.assign(new Error('Invalid image'), { code: 'telegram_campaign_media_invalid' });
        saveCampaignMediaDraft(audienceId ?? searchId, next);
        setUploadedMedia(next);
        setMediaState('uploaded');
        setMediaError(false);
        setMediaNotice('Bridge подтвердил изображение. Оно готово для серверной проверки кампании.');
      } catch (error) {
        if (!active) return;
        setMediaState('error');
        setMediaError(true);
        setMediaNotice(campaignMediaErrorCopy(error));
      }
    };
    timer = setTimeout(() => { void check(); }, 1000);
    return () => { active = false; clearTimeout(timer); };
  }, [mediaState, uploadedMedia, searchId, audienceId]);

  useEffect(() => () => {
    mediaUploadSequence.current += 1;
    mediaUploadAbortController.current?.abort();
    mediaUploadAbortController.current = null;
  }, []);

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
  const audienceSelectionVersion = audience?.audienceVersion;
  useEffect(() => {
    if (!audienceId || campaign) return;
    setSelectedLeadIds(new Set(initialSelection.current));
    setServerSelection(null);
    setPreparation(null);
    prepareRequestKey.current = null;
    createRequestKey.current = null;
  }, [audienceId, audienceSelectionVersion, campaign]);
  useEffect(() => {
    const available = new Set(leadIdsSignature ? leadIdsSignature.split('\u0000') : []);
    const next = new Set([...selectedLeadIds].filter((id) => available.has(id)));
    if (next.size === selectedLeadIds.size) return;
    setSelectedLeadIds(next);
    setPreparation(null);
    setOperationNotice('Состав найденных компаний изменился; серверную проверку нужно выполнить заново.');
    setOperationError(false);
    prepareRequestKey.current = null;
    createRequestKey.current = null;
  }, [leadIdsSignature, selectedLeadIds]);

  const selectedLeads = useMemo(() => leads.filter((lead) => selectedLeadIds.has(lead.id)), [leads, selectedLeadIds]);
  const selectedCorporateCandidates = useMemo(
    () => selectedLeads.filter((lead) => !excludedRecipientIds?.includes(lead.id)
      && !['contacted','replied','qualified','meeting','won'].includes(lead.lifecycle)
      && (classifyCampaignLeadLocally(lead).classification === 'automatic'
        || serverSelection?.selection.items.some((item) => item.companyId === lead.id
          && ['documented_basis_required', 'verified_corporate_authorized'].includes(item.reasonCode)))),
    [selectedLeads,excludedRecipientIds,serverSelection],
  );
  const authorizationNeededCandidates = selectedCorporateCandidates.filter((lead) =>
    !authorizedLeadIds.has(lead.id) && !serverSelection?.selection.items.some((item) =>
      item.companyId === lead.id && item.classification === 'automatic'
      && isValidCampaignRecipientAuthorization(item.authorization, contactBasis)));
  const authorizationLead = authorizationNeededCandidates
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
    && !audienceSyncIssue
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
  const displayedSelection = serverSelection?.selection ?? localSummary;
  const automaticLeadIds = useMemo(() => verifiedTelegramLeadIds(leads), [leads]);
  const draftCandidateLeadIds = useMemo(() => mobileOrUsernameLeadIds(leads), [leads]);
  const uniqueFoundLeadCount = useMemo(() => new Set(leads.map((lead) => lead.id)).size, [leads]);
  const telegramLeadCount = useMemo(() => {
    const ids = new Set<string>();
    for (const lead of leads) {
      if (isCampaignDraftCandidateLead(lead) && (lead.telegramContact || lead.telegramUrl)) ids.add(lead.id);
    }
    return ids.size;
  }, [leads]);
  const automaticLeadCount = serverSelection?.selection.verified ?? automaticLeadIds.length;
  const accountConnectionId = account?.connectionId ?? account?.id ?? null;
  const effectiveAccountReadiness = account?.readiness ?? telegramAccountReadiness;
  const accountReadinessBlocked = effectiveAccountReadiness?.status === 'blocked'
    || Boolean(effectiveAccountReadiness?.blockers.length);
  const connected = account?.status === 'connected'
    && Boolean(accountConnectionId)
    && !accountReadinessBlocked;
  const accountIdentityLabel = account?.displayName
    || account?.maskedLabel
    || (account?.username ? `@${account.username.replace(/^@/, '')}` : null)
    || account?.phoneMasked
    || null;
  const accountIdentityAvailable = connected && Boolean(accountIdentityLabel);
  const accountIdentityKey = `${accountConnectionId ?? ''}:${account?.stateVersion ?? ''}:${accountIdentityLabel ?? ''}`;
  const qrExpired = isTelegramAccountQrExpired(account, accountClock);
  const decryptedQrMatches = Boolean(
    decryptedQr && account?.qr && decryptedQr.authId === account.qr.authId,
  );
  const safeQr = qrExpired || !decryptedQrMatches ? null : decryptedQr?.qrCodeDataUrl ?? null;
  const safeQrLoginUrl = qrExpired || !decryptedQrMatches
    ? null
    : safeTelegramLoginUrl(decryptedQr?.qrLoginUrl);
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
  const hasImageAttachment = Boolean(imageFile || uploadedMedia);
  const messageLimit = campaignMessageLimit(hasImageAttachment);
  const attachmentReference = mediaState === 'uploaded' && uploadedMedia
    ? { mediaId: uploadedMedia.mediaId, mediaDigest: uploadedMedia.mediaDigest }
    : null;
  const attachmentReady = !hasImageAttachment || Boolean(attachmentReference);
  const draftIdentity = JSON.stringify([searchId, audience?.audienceVersion, accountIdentityKey,
    [...selectedLeadIds].sort(), excludedRecipientIds, template, contactBasis, attachmentReference, campaignOutreachEnabled, audienceSyncIssue]);
  const currentDraftKey = useRef(draftIdentity);
  currentDraftKey.current = draftIdentity;
  const currentAccountIdentity = useRef(accountIdentityKey);
  currentAccountIdentity.current = accountIdentityKey;
  useEffect(() => {
    setPreparation(null);
    prepareRequestKey.current = null;
    createRequestKey.current = null;
  }, [draftIdentity]);
  const mediaBusy = mediaState === 'validating' || mediaState === 'uploading' || mediaState === 'checking' || mediaState === 'removing';
  const longestLocalPreviewLength = selectedCorporateCandidates.reduce((longest, lead) => (
    Math.max(longest, renderCampaignPreview(template, lead.name).length)
  ), template.length);
  const localPersonalizationFits = !hasImageAttachment
    || longestLocalPreviewLength <= LEAD_RADAR_CAMPAIGN_CAPTION_LIMIT;
  const composerPreviewCompany = selectedCorporateCandidates[0]?.name ?? null;
  const composerPreviewText = composerPreviewCompany
    ? renderCampaignPreview(template, composerPreviewCompany)
    : template;
  const templateReadyForSelected = isCampaignTemplateReady(template, hasImageAttachment)
    && localPersonalizationFits;
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
  const serverPreviewsFit = previewItems.every((preview) => (
    typeof preview.text === 'string' && preview.text.length <= messageLimit
  ));
  const reviewComplete = previewComplete && authorizationComplete && serverPreviewsFit;
  const templateIssue = templateReadyForSelected
    ? null
    : template.trim().length === 0
      ? 'Введите текст сообщения.'
      : template.length > messageLimit
        ? `С изображением подпись Telegram ограничена ${LEAD_RADAR_CAMPAIGN_CAPTION_LIMIT} символами. Сократите текст или удалите изображение.`
        : !localPersonalizationFits
          ? `После подстановки названия компании самая длинная подпись содержит ${longestLocalPreviewLength} символов из ${LEAD_RADAR_CAMPAIGN_CAPTION_LIMIT}. Сократите текст.`
        : `Используйте только переменную {company_name} и не превышайте ${messageLimit} символов.`;
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
    && !audienceSyncIssue
    && campaignRecoveryReady
    && connected
    && accountIdentityAvailable
    && !account?.identityReviewRequired
    && contactBasis
    && preparation
    && !preparationExpired
    && serverSummary
    && serverSummary.automatic > 0
    && reviewComplete
    && attachmentReady
    && (!hasImageAttachment || Boolean(imagePreviewUrl))
    && !operationBusy,
  );

  useEffect(() => {
    setAccountIdentityConfirmed(false);
    setPreparation(null);
    prepareRequestKey.current = null;
    createRequestKey.current = null;
  }, [accountIdentityKey]);

  useEffect(() => {
    setAccountSetupNoticeVisible(false);
  }, [account?.status, telegramAccountEnabled]);

  const authorizationCandidateSignature = authorizationNeededCandidates.map((lead) => lead.id).join('\u0000');
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
    setOperationNotice(null);
    setOperationError(false);
    prepareRequestKey.current = null;
    createRequestKey.current = null;
  }

  function startNewDraftAfterTerminalCampaign(): void {
    if (!campaign || !isCampaignTerminal(campaign.status)) return;
    // A new batch never silently reuses the previous approved snapshot.
    setSelectedLeadIds((current)=>new Set([...current].filter((id)=>!preparedCompanyIds.current.includes(id))));
    setCampaign(null);
    invalidatePreparation();
    setOperationNotice('Завершённая кампания закрыта. Редактор нового оффера разблокирован.');
    setOperationError(false);
    window.requestAnimationFrame(() => document.getElementById(`${composerHelpId}-input`)?.focus());
  }

  function restoreFocus(elementId: string): void {
    window.requestAnimationFrame(() => document.getElementById(elementId)?.focus());
  }

  function toggleLead(lead: LeadRadarLead): void {
    if (audience) return;
    if (!recipientContactChoices(lead).selectable || operationBusy || campaign) return;
    const next = new Set(selectedLeadIds);
    if (next.has(lead.id)) {
      next.delete(lead.id);
    } else if (next.size < AUDIENCE_LIMIT) {
      next.add(lead.id);
    } else {
      setOperationError(true);
      setOperationNotice(`Для подготовки можно выбрать до ${AUDIENCE_LIMIT} контактов. В одной кампании — до 50 проверенных адресатов.`);
      return;
    }
    setSelectedLeadIds(next);
    invalidatePreparation();
  }

  function selectAllFound(): void {
    if (audience) return;
    if (operationBusy || campaign) return;
    if (draftCandidateLeadIds.length > AUDIENCE_LIMIT) {
      setOperationError(true);
      setOperationNotice(`Найдено больше ${AUDIENCE_LIMIT} контактов. Уточните фильтр в общей базе. Частичный выбор не выполнен.`);
      return;
    }
    setSelectedLeadIds(new Set(draftCandidateLeadIds));
    invalidatePreparation();
    const excludedFromDelivery = draftCandidateLeadIds
      .filter((leadId) => !automaticLeadIds.includes(leadId)).length;
    if (draftCandidateLeadIds.length > 0) {
      setOperationError(false);
      setOperationNotice(`Выбраны все ${draftCandidateLeadIds.length} контактов с мобильным или username. ${excludedFromDelivery} ещё нуждаются в проверке Telegram. Для одной кампании проверяются до 50 корпоративных адресатов; остальные остаются в выборе. Ничего не отправлено.`);
    }
  }

  function selectAllReady(): void {
    if (audience) return;
    if (operationBusy || campaign) return;
    setSelectedLeadIds(new Set(automaticLeadIds.slice(0, LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT)));
    invalidatePreparation();
    if (automaticLeadIds.length > LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT) {
      setOperationError(false);
      setOperationNotice(`Выбраны первые 50 из ${automaticLeadIds.length} контактов, подтверждённых локальным Bridge. Сервер повторит проверку перед отправкой.`);
    } else if (automaticLeadIds.length > 0) {
      setOperationError(false);
      setOperationNotice(`Выбраны ${automaticLeadIds.length} контактов, подтверждённых локальным Bridge. Финальное решение примет сервер.`);
    }
  }

  function clearAllSelection(): void {
    if (audience) return;
    if (operationBusy || campaign || selectedLeadIds.size === 0) return;
    setSelectedLeadIds(new Set());
    invalidatePreparation();
    setOperationError(false);
    setOperationNotice('Выбор снят со всех компаний. Ничего не отправлено.');
  }

  function revealSection(target: { current: HTMLElement | null }): void {
    target.current?.scrollIntoView({ block: 'start' });
    target.current?.focus({ preventScroll: true });
  }

  function explainBlockedAccountAction(): void {
    setAccountSetupNoticeVisible(true);
    window.requestAnimationFrame(() => accountSetupNoticeRef.current?.focus());
  }

  function updateTemplate(value: string): void {
    if (operationBusy || campaign) return;
    const bounded = boundCampaignTemplate(value);
    setTemplate(bounded);
    saveCampaignTemplateDraft(bounded, searchId);
    invalidatePreparation();
  }

  async function selectCampaignImage(file: File | null): Promise<void> {
    if (!file || operationBusy || campaign || mediaBusy) return;
    const localIssue = validateCampaignImage(file);
    if (localIssue) {
      setMediaError(true);
      setMediaNotice(`${CAMPAIGN_IMAGE_VALIDATION_COPY[localIssue]}${imageFile ? ' Текущее изображение не изменено.' : ''}`);
      if (!imageFile) setMediaState('error');
      return;
    }
    const validationSequence = mediaValidationSequence.current + 1;
    mediaValidationSequence.current = validationSequence;
    const fallbackState: CampaignMediaState = imageFile
      ? uploadedMedia ? 'uploaded' : 'ready'
      : 'error';
    setMediaState('validating');
    setMediaProgress(0);
    setMediaError(false);
    setMediaNotice('Проверяем формат и размеры изображения…');
    let decodedIssue: LeadRadarCampaignImageValidationCode | null;
    try {
      decodedIssue = await inspectCampaignImage(file);
    } catch {
      decodedIssue = 'invalid_dimensions';
    }
    if (validationSequence !== mediaValidationSequence.current || !panelMounted.current) return;
    if (decodedIssue) {
      setMediaState(fallbackState);
      setMediaError(true);
      setMediaNotice(`${CAMPAIGN_IMAGE_VALIDATION_COPY[decodedIssue]}${imageFile ? ' Текущее изображение не изменено.' : ''}`);
      return;
    }
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setMediaState('ready');
    setMediaProgress(0);
    setMediaError(false);
    setMediaNotice(`«${file.name}» проверено. Загружаем в защищённый черновик; это не отправка.`);
    mediaUploadRequestKey.current = null;
    invalidatePreparation();
    await uploadCampaignImage(file);
  }

  async function uploadCampaignImage(selectedFile?: File): Promise<void> {
    const uploadFile = selectedFile ?? imageFile;
    if (!uploadFile || operationBusy || campaign || (!selectedFile && mediaBusy)) return;
    const uploadSearchId = searchId;
    const uploadSequence = mediaUploadSequence.current + 1;
    mediaUploadSequence.current = uploadSequence;
    mediaUploadAbortController.current?.abort();
    const abortController = new AbortController();
    mediaUploadAbortController.current = abortController;
    const previousMedia = uploadedMedia;
    const requestKey = mediaUploadRequestKey.current
      ?? `lead-radar-campaign-media-ui-${crypto.randomUUID()}`;
    mediaUploadRequestKey.current = requestKey;
    setMediaState('uploading');
    setMediaProgress(0);
    setMediaError(false);
    setMediaNotice('Загружаем изображение в защищённое хранилище…');
    try {
      const next = await api.leadRadarUploadTelegramCampaignImage(
        uploadFile,
        requestKey,
        (percent) => {
          if (uploadSequence === mediaUploadSequence.current
            && currentSearchId.current === uploadSearchId) setMediaProgress(percent);
        },
        abortController.signal,
      );
      if (uploadSequence !== mediaUploadSequence.current
        || currentSearchId.current !== uploadSearchId) {
        if (isValidCampaignMediaUpload(next)) {
          void api.leadRadarDeleteTelegramCampaignImage(next.mediaId).catch(() => undefined);
        }
        return;
      }
      if (!isValidCampaignMediaUpload(next)
        || next.mimeType !== uploadFile.type
        || next.sizeBytes !== uploadFile.size) {
        throw Object.assign(new Error('Invalid campaign media upload response'), { status: 502 });
      }
      mediaUploadRequestKey.current = null;
      setMediaProgress(100);
      let previousCleanupIssue: string | null = null;
      if (previousMedia && previousMedia.mediaId !== next.mediaId) {
        try {
          await api.leadRadarDeleteTelegramCampaignImage(previousMedia.mediaId);
        } catch (cleanupError) {
          previousCleanupIssue = campaignMediaErrorCopy(cleanupError);
        }
      }
      if (uploadSequence !== mediaUploadSequence.current
        || currentSearchId.current !== uploadSearchId) {
        void api.leadRadarDeleteTelegramCampaignImage(next.mediaId).catch(() => undefined);
        return;
      }
      setUploadedMedia(next);
      saveCampaignMediaDraft(audienceId ?? searchId, next);
      mediaCheckStartedAt.current = Date.now();
      setMediaState(next.validation?.status === 'pending' ? 'checking' : 'uploaded');
      setMediaError(Boolean(previousCleanupIssue));
      setMediaNotice(previousCleanupIssue
        ? `Новое изображение загружено и выбрано. Предыдущая защищённая копия пока сохранена сервером: ${previousCleanupIssue}`
        : 'Изображение загружено и будет включено в следующую серверную проверку. Отправка ещё не началась.');
      invalidatePreparation();
    } catch (uploadError) {
      const errorCode = (uploadError as { code?: string })?.code;
      if (uploadSequence !== mediaUploadSequence.current
        || currentSearchId.current !== uploadSearchId
        || errorCode === 'ABORTED') return;
      setMediaState('error');
      setMediaError(true);
      setMediaNotice(campaignMediaErrorCopy(uploadError));
    } finally {
      if (uploadSequence === mediaUploadSequence.current
        && mediaUploadAbortController.current === abortController) {
        mediaUploadAbortController.current = null;
      }
    }
  }

  async function removeCampaignImage(): Promise<void> {
    if (operationBusy || campaign || mediaBusy || (!imageFile && !uploadedMedia)) return;
    const removalSearchId = searchId;
    const removalSequence = mediaUploadSequence.current + 1;
    mediaUploadSequence.current = removalSequence;
    mediaUploadAbortController.current?.abort();
    mediaUploadAbortController.current = null;
    const mediaToDelete = uploadedMedia;
    mediaValidationSequence.current += 1;
    setMediaState('removing');
    setMediaError(false);
    setMediaNotice(mediaToDelete ? 'Удаляем изображение из защищённого черновика…' : 'Удаляем выбранное изображение…');
    let cleanupIssue: string | null = null;
    if (mediaToDelete) {
      try {
        await api.leadRadarDeleteTelegramCampaignImage(mediaToDelete.mediaId);
      } catch (deleteError) {
        cleanupIssue = campaignMediaErrorCopy(deleteError);
      }
    }
    if (removalSequence !== mediaUploadSequence.current
      || currentSearchId.current !== removalSearchId) return;
    setImageFile(null);
    setImagePreviewUrl(null);
    setUploadedMedia(null);
    saveCampaignMediaDraft(audienceId ?? searchId, null);
    setMediaState('idle');
    setMediaProgress(0);
    setMediaError(Boolean(cleanupIssue));
    setMediaNotice(cleanupIssue
      ? `Из нового сообщения картинка убрана. ${cleanupIssue}`
      : 'Изображение удалено из сообщения. Ничего не отправлено.');
    setImageDragActive(false);
    if (imageInputRef.current) imageInputRef.current.value = '';
    mediaUploadRequestKey.current = null;
    invalidatePreparation();
  }

  async function connectAccount(): Promise<void> {
    if (!telegramAccountEnabled || accountBusy) return;
    changeAccountBusy(true);
    setConnectStarting(true);
    revealSection(accountSectionRef);
    setAccountNotice(null);
    try {
      // Every explicit click is a new attempt. The server recovers an already
      // accepted private challenge by tenant, so retaining an expired browser
      // idempotency key can only replay the stale attempt and wedge reconnect.
      const requestKey = `lead-radar-account-connect-ui-${crypto.randomUUID()}`;
      connectRequestKey.current = requestKey;
      setDecryptedQr(null);
      const next = await api.leadRadarConnectTelegramAccount(requestKey);
      connectRequestKey.current = null;
      setAccountClock(Date.now());
      setAccount(next);
      revealSection(accountSectionRef);
      setAccountNotice(next.status === 'connected'
        ? 'Telegram подтвердил подключение выделенного аккаунта.'
        : next.authState === 'awaiting_phone'
          ? 'Введите номер с кодом страны. Код придёт в системный чат Telegram; сообщения ещё не отправляются.'
          : 'Bridge готовит защищённую форму номера. Она появится здесь автоматически; сообщения ещё не отправляются.');
    } catch (connectError) {
      if (hasDefiniteHttpResponse(connectError)) {
        connectRequestKey.current = null;
        clearBridgeBrowserCeremony();
      }
      const recovered = await loadAccount();
      setAccountNotice(recovered?.status === 'connecting' || recovered?.status === 'pending'
        ? 'Запрос подключения принят. Дождитесь формы номера телефона; отправка сообщений пока закрыта.'
        : campaignErrorCopy(connectError));
    } finally {
      setConnectStarting(false);
      changeAccountBusy(false);
    }
  }

  async function createBridgePairing(): Promise<void> {
    if (!telegramAccountEnabled || bridgePairingBusy) return;
    const pending = bridgePairingRequest.current ?? {
      operationId: `lead-radar-bridge-pair-ui-${crypto.randomUUID()}`,
      enrollmentCode: createTelegramBridgeEnrollmentCode(),
    };
    bridgePairingRequest.current = pending;
    setBridgePairingBusy(true);
    setBridgePairingNotice(null);
    try {
      const created = await api.leadRadarCreateTelegramBridgePairing({
        label: 'Lead Radar Windows Bridge',
        enrollmentCode: pending.enrollmentCode,
      }, pending.operationId);
      const enrollmentUri = telegramBridgeEnrollmentUri({
        pairingId: created.pairingId,
        origin: LEAD_RADAR_TELEGRAM_BRIDGE_PUBLIC_ORIGIN,
      });
      setBridgePairing({ ...created, enrollmentUri, enrollmentCode: pending.enrollmentCode });
      setBridgePairingNotice('Откройте Bridge, затем вставьте одноразовый код в защищённое локальное окно.');
    } catch (pairingError) {
      if (hasDefiniteHttpResponse(pairingError)) bridgePairingRequest.current = null;
      setBridgePairingNotice(campaignErrorCopy(pairingError));
    } finally {
      setBridgePairingBusy(false);
    }
  }

  async function copyBridgePairingCode(openingBridge = false): Promise<void> {
    if (!bridgePairing) return;
    try {
      await navigator.clipboard.writeText(bridgePairing.enrollmentCode);
      setBridgePairingNotice(openingBridge
        ? 'Одноразовый код скопирован. Bridge подхватит его из защищённого локального буфера автоматически.'
        : 'Одноразовый код скопирован. Bridge подхватит его автоматически или код можно вставить вручную.');
    } catch {
      setBridgePairingNotice(openingBridge
        ? 'Bridge открыт, но браузер не разрешил автокопирование. Нажмите «Скопировать код» и вставьте его вручную.'
        : 'Автокопирование недоступно. Выделите код ниже и скопируйте вручную.');
    }
  }

  async function openBridgeWithPairingCode(): Promise<void> {
    if (!bridgePairing) return;
    await copyBridgePairingCode(true);
    window.location.assign(bridgePairing.enrollmentUri);
  }

  async function revokeBridgeDevice(): Promise<void> {
    const deviceId = bridgeDevice?.deviceId;
    if (!deviceId || bridgePairingBusy) return;
    const requestKey = bridgeRevokeRequestKey.current
      ?? `lead-radar-bridge-revoke-ui-${crypto.randomUUID()}`;
    bridgeRevokeRequestKey.current = requestKey;
    setBridgePairingBusy(true);
    setBridgePairingNotice(null);
    try {
      await api.leadRadarRevokeTelegramBridge(deviceId, requestKey);
      bridgeRevokeRequestKey.current = null;
      bridgePairingRequest.current = null;
      setBridgePairing(null);
      setBridgeRevokeConfirmation(false);
      setBridgePairingNotice('Bridge отвязан. Локальная программа должна подтвердить удаление; затем можно привязать другой компьютер.');
      await Promise.all([loadBridgeDevice(), loadAccount()]);
    } catch (revokeError) {
      if (hasDefiniteHttpResponse(revokeError)) bridgeRevokeRequestKey.current = null;
      setBridgePairingNotice(campaignErrorCopy(revokeError));
    } finally {
      setBridgePairingBusy(false);
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
        : next.authState === 'awaiting_code'
          ? 'Telegram ждёт код подтверждения. Введите последний полученный код; сообщения не отправляются.'
          : 'Telegram ещё не подтвердил вход. Завершите текущий шаг; сообщения не отправляются.');
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
      clearBridgeBrowserCeremony();
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
        searchId: authorizationLead.searchId,
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
      const nextCandidate = authorizationNeededCandidates.find((lead) => (
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
          ? 'Сервер не подтвердил Telegram этой компании или запись помечена «Не связываться». Подтверждение не создано.'
          : campaignErrorCopy(authorizationFailure));
    } finally {
      setAuthorizationBusy(false);
    }
  }

  async function prepareCampaign(): Promise<void> {
    const accountId = accountConnectionId;
    if (!campaignOutreachEnabled || audienceSyncIssue || !campaignRecoveryReady || operationBusy || campaign
      || preparationInFlight.current || selectedLeadIds.size === 0) return;
    preparationInFlight.current = true;
    preparationCancelled.current = false;
    const draftKey = currentDraftKey.current;
    setOperationBusy(true);
    setPreparation(null);
    setOperationNotice('Проверяем контакты и готовность. Это не отправка…');
    setOperationError(false);
    try {
      const snapshot = await readinessRef.current?.prepare();
      if (!panelMounted.current || preparationCancelled.current || draftKey !== currentDraftKey.current) return;
      if (!snapshot) {
        setOperationError(true);
        setOperationNotice('Подготовка не завершена. Посмотрите статус проверки контактов и повторите — прогресс сохранён.');
        return;
      }
      if (!connected || !accountId || !accountIdentityAvailable || account?.identityReviewRequired
        || !contactBasis || snapshot.blockers.length > 0 || snapshot.selection.automatic === 0
        || !templateReadyForSelected || !attachmentReady) {
        setOperationError(true);
        setOperationNotice(!contactBasis ? 'Укажите реальное основание обращения. Выбор пункта не создаёт согласия: записи по компаниям проверяются отдельно.'
          : !templateReadyForSelected ? 'Проверьте текст: он должен быть заполнен и помещаться в лимит для каждого получателя.'
          : !attachmentReady ? 'Изображение ещё загружается или не прошло проверку. Дождитесь готовности либо удалите его.'
          : 'Пока нет готового к запуску набора. Конкретные причины показаны в блоке готовности контактов; аудитория сохранена.');
        return;
      }
      const requestKey = prepareRequestKey.current ?? `lead-radar-campaign-prepare-ui-${crypto.randomUUID()}`;
      prepareRequestKey.current = requestKey;
      const requestCompanyIds=snapshot.selection.automaticCompanyIds.filter((id)=>selectedLeadIds.has(id) && !excludedRecipientIds?.includes(id)).slice(0,LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT);
      const next = await api.leadRadarPrepareTelegramCampaign({
        accountId,
        ...campaignSource,
        leadIds: requestCompanyIds,
        template,
        contactBasis,
        attachment: attachmentReference,
      }, requestKey);
      if (!panelMounted.current || preparationCancelled.current || draftKey !== currentDraftKey.current) return;
      if (!validPreparation(next)) throw Object.assign(new Error('Invalid campaign preparation'), { status: 502 });
      preparedCompanyIds.current=requestCompanyIds;
      prepareRequestKey.current = null;
      setPreparationClock(Date.now());
      setPreparation(next);
      const summary = preparationSummary(next);
      setOperationNotice(summary && summary.automatic > 0
        ? 'Сервер проверил точный список и текст. Просмотрите итог перед запуском.'
        : 'Сервер не подтвердил ни одного адресата для автоматической отправки. Кампания не может быть запущена.');
    } catch (prepareError) {
      if (!panelMounted.current || preparationCancelled.current || draftKey !== currentDraftKey.current) return;
      if (hasDefiniteHttpResponse(prepareError)) prepareRequestKey.current = null;
      setPreparation(null);
      setOperationError(true);
      setOperationNotice(campaignErrorCopy(prepareError));
    } finally {
      preparationInFlight.current = false;
      if (panelMounted.current) setOperationBusy(false);
    }
  }

  async function transitionCampaign(action: 'start' | 'pause' | 'resume' | 'stop', campaignId = campaign?.id, confirmedIdentity?: string): Promise<LeadRadarTelegramCampaignReadModel | null> {
    if (!campaignId || operationBusy) return null;
    if ((action === 'start' || action === 'resume') && !campaignAutoSendEnabled) {
      setOperationError(true);
      setOperationNotice('Автоматический запуск ещё не разрешён защитным переключателем. Кампания остаётся без новых отправок.');
      return null;
    }
    if ((action === 'start' || action === 'resume') && (!connected || (!accountIdentityConfirmed && confirmedIdentity !== currentAccountIdentity.current))) {
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
    if (createInFlight.current || !createReady || !preparation || !accountId || !contactBasis || preparedCompanyIds.current.length === 0) return;
    createInFlight.current = true;
    const approvedIdentity = currentAccountIdentity.current;
    const approvedDraft = currentDraftKey.current;
    // This final click attests the displayed sender AND exact server previews.
    setAccountIdentityConfirmed(true);
    const requestKey = createRequestKey.current ?? `lead-radar-campaign-create-ui-${crypto.randomUUID()}`;
    createRequestKey.current = requestKey;
    setOperationBusy(true);
    setOperationNotice(null);
    setOperationError(false);
    try {
      const response = await api.leadRadarCreateTelegramCampaign({
        accountId,
        ...campaignSource,
        leadIds: [...preparedCompanyIds.current],
        template,
        contactBasis,
        approvalToken: preparation.approvalToken,
        selectionDigest: preparation.selectionDigest,
        contentDigest: preparation.contentDigest,
        attachment: attachmentReference,
      }, requestKey);
      const created = campaignFromMutation(response);
      if (!validCampaignReadModel(created)) throw Object.assign(new Error('Invalid campaign create response'), { status: 502 });
      createRequestKey.current = null;
      if (!panelMounted.current) return; // Recovery can find it; never start after leaving the scope.
      setCampaignClock(Date.now());
      setCampaign(created);
      if (approvedIdentity !== currentAccountIdentity.current || approvedDraft !== currentDraftKey.current) {
        setOperationError(true);
        setOperationNotice('Кампания сохранена без запуска: аккаунт или черновик изменился. Обновите её статус и сверьте состав.');
        return;
      }
      if (created.status !== 'approved') {
        setOperationError(true);
        setOperationNotice('Кампания сохранена, но сервер не подтвердил её готовность к запуску. Сообщения не отправляются.');
        return;
      }
      if (!campaignAutoSendEnabled) {
        setOperationNotice('Кампания создана и остаётся без отправок. Запуск закрыт отдельным защитным переключателем.');
        return;
      }
      await transitionCampaign('start', created.id, approvedIdentity);
    } catch (createError) {
      if (hasDefiniteHttpResponse(createError)) createRequestKey.current = null;
      if (!panelMounted.current) return;
      if ((createError as { code?: string })?.code === 'telegram_campaign_active_exists') {
        await recoverCampaign();
        return;
      }
      setOperationError(true);
      setOperationNotice(campaignErrorCopy(createError));
    } finally {
      createInFlight.current = false;
      if (panelMounted.current) setOperationBusy(false);
    }
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
  const authProgress = telegramAuthProgress(account);
  const pendingConnection = accountStatus === 'pending' || accountStatus === 'connecting';
  const awaitingTwoFactorPassword = (accountStatus === 'pending' || accountStatus === 'connecting')
    && account?.authState === 'awaiting_password';
  const awaitingPhone = pendingConnection && account?.authState === 'awaiting_phone';
  const awaitingCode = pendingConnection && account?.authState === 'awaiting_code';
  const accountCopy = awaitingTwoFactorPassword
    ? {
      label: 'Нужен пароль 2FA',
      tone: 'warning' as const,
      detail: 'Код подтверждён. Telegram ожидает пароль двухэтапной защиты; отправка остаётся закрытой.',
    }
    : accountStatus ? ACCOUNT_STATUS_COPY[accountStatus] : null;
  const accountReadinessReasonCode = effectiveAccountReadiness?.blockers[0] ?? account?.reasonCode;
  const accountReadinessReason = accountReadinessReasonCode
    ? ACCOUNT_READINESS_REASON_COPY[accountReadinessReasonCode] ?? null
    : null;
  const bridgeStatus = bridgeDevice?.status
    ?? (effectiveAccountReadiness?.blockers.includes('bridge_not_paired') ? 'unpaired' : null);
  const bridgeStatusCopy = bridgeStatus === 'online'
    ? { label: 'Bridge в сети', tone: 'success' as const, detail: `Компьютер отвечает${bridgeDevice?.lastSeenAt ? ` · ${formatDate(bridgeDevice.lastSeenAt)}` : ''}.` }
    : bridgeStatus === 'offline'
      ? { label: 'Bridge не в сети', tone: 'warning' as const, detail: 'Запустите локальную программу на привязанном компьютере.' }
      : bridgeStatus === 'pending_revocation'
        ? { label: 'Удаляем сессию', tone: 'warning' as const, detail: 'Ждём локального подтверждения удаления. Новые отправки закрыты.' }
        : { label: 'Bridge не привязан', tone: 'neutral' as const, detail: 'Создайте одноразовую привязку для этого компьютера.' };
  const bridgeNeedsPairing = bridgeStatus === 'unpaired'
    || bridgeStatus === 'revoked'
    || effectiveAccountReadiness?.blockers.includes('bridge_not_paired')
    || Boolean(bridgePairing);
  const bridgePairingRemainingSeconds = bridgePairing
    ? Math.max(0, Math.ceil((Date.parse(bridgePairing.expiresAt) - bridgePairingClock) / 1_000))
    : 0;
  const bridgePairingRemainingLabel = `${Math.floor(bridgePairingRemainingSeconds / 60)}:${String(bridgePairingRemainingSeconds % 60).padStart(2, '0')}`;
  const canRevokeBridge = Boolean(bridgeDevice?.deviceId)
    && (accountStatus === 'disconnected' || accountStatus === 'revoked')
    && bridgeStatus !== 'pending_revocation'
    && bridgeStatus !== 'revoked';
  const accountQuickAction = telegramAccountQuickAction(accountStatus, telegramAccountEnabled);
  const canRequestConnection = accountQuickAction === 'connect' && !accountReadinessBlocked;
  const foundSelectionIds = draftCandidateLeadIds;
  const readySelectionIds = automaticLeadIds.slice(0, LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT);
  const allFoundSelected = foundSelectionIds.length > 0
    && foundSelectionIds.every((leadId) => selectedLeadIds.has(leadId));
  const allReadySelected = readySelectionIds.length > 0
    && readySelectionIds.every((leadId) => selectedLeadIds.has(leadId))
    && selectedLeadIds.size === readySelectionIds.length;
  const bulkSelectionLocked = operationBusy || Boolean(campaign) || !campaignRecoveryReady;
  const bulkFoundSelectDisabled = Boolean(audience) || bulkSelectionLocked || foundSelectionIds.length === 0 || allFoundSelected;
  const bulkReadySelectDisabled = Boolean(audience) || bulkSelectionLocked || readySelectionIds.length === 0 || allReadySelected;
  const bulkClearDisabled = Boolean(audience) || bulkSelectionLocked || selectedLeadIds.size === 0;
  const accountQuickActionBlocked = accountQuickAction.startsWith('blocked_') || accountReadinessBlocked;
  const accountQuickActionBusy = accountBusy || accountLoading;
  const accountQuickActionLabel = accountBusy
    ? 'Подключаем…'
    : accountLoading
      ? 'Проверяем аккаунт…'
      : connected
        ? 'Открыть подключённый аккаунт'
        : pendingConnection
        ? awaitingTwoFactorPassword ? 'Ввести пароль 2FA'
            : awaitingCode ? 'Ввести код Telegram'
              : awaitingPhone ? 'Ввести номер телефона' : 'Перейти к форме входа'
          : accountReadinessReason
            ? 'Что нужно настроить'
            : accountQuickAction === 'connect'
              ? accountStatus === 'disconnected' ? 'Подключить Telegram' : 'Переподключить Telegram'
            : accountQuickAction === 'inspect'
              ? 'Показать аккаунт на паузе'
              : accountQuickAction === 'blocked_unconfigured'
                ? 'Сначала настройте Telegram-шлюз'
                : accountQuickAction === 'blocked_restricted'
                  ? 'Аккаунт ограничен Telegram'
                  : accountQuickAction === 'blocked_feature'
                    ? 'Подключить Telegram'
                    : 'Статус аккаунта недоступен';
  const accountQuickStatus = authProgress ?? accountReadinessReason ?? (!telegramAccountEnabled
    ? 'Серверный контур пока выключен — кнопка станет активной после настройки.'
      : accountLoading && !account
      ? 'Проверяем локальный Bridge и сессию Telegram.'
      : connected
        ? `Подключён ${accountIdentityLabel ?? 'выделенный аккаунт'}. Проверьте его карточку перед запуском.`
        : pendingConnection
          ? awaitingTwoFactorPassword
            ? 'Telegram подтвердил код и ожидает пароль двухэтапной защиты.'
            : awaitingCode ? 'Код отправлен. Введите его из Telegram.'
              : awaitingPhone
                ? 'Введите номер с кодом страны, чтобы получить код Telegram.'
                : 'Bridge готовит форму номера. Telegram Desktop не открывается этой кнопкой: код появится в приложении после отправки номера.'
          : accountCopy?.detail ?? 'Статус аккаунта ещё не получен; отправка закрыта.');
  const accountBlockingExplanation = accountReadinessReason ?? (accountQuickAction === 'blocked_feature'
    ? 'Подключение отключено серверным переключателем. QR не создавался, запрос подключения не выполнялся, ничего не отправлено.'
    : accountQuickAction === 'blocked_unconfigured'
      ? 'Бесплатный локальный Bridge ещё не настроен или не запущен. Сначала завершите привязку; ничего не отправлено.'
      : accountQuickAction === 'blocked_restricted'
        ? 'Telegram ограничил этот аккаунт. Новое подключение и отправка заблокированы до снятия ограничения; ничего не отправлено.'
        : 'Сервер не вернул подтверждённое состояние аккаунта. Обновите страницу или статус; подключение и отправка не выполнялись.');
  const bulkSelectionStatus = campaign
    ? 'Состав текущей кампании уже зафиксирован сервером.'
    : campaignRecoveryIssue
      ? 'Не удалось проверить состояние кампаний на сервере. Повторите проверку состояния; это не означает, что рассылка уже запущена.'
      : !campaignRecoveryReady
      ? 'Проверяем на сервере, есть ли активная кампания. Ничего не отправляется.'
      : draftCandidateLeadIds.length === 0
        ? 'Нет компаний, которые можно добавить: записи «Не связываться» всегда исключаются.'
        : 'Выбор включает мобильные номера и Telegram-username, но не означает готовность к отправке. Подготовка кампании проверяет до 50 корпоративных Telegram-кандидатов; остальные остаются для проверки. Записи «Не связываться» исключены.';

  return (
    <section aria-labelledby={headingId} data-testid="lead-radar-telegram-campaign" className="space-y-4 motion-reduce:[&_button]:transform-none motion-reduce:[&_button]:transition-none">
      {audience && <p className="rounded-xl border border-brand-cyan/20 p-4 text-sm text-white/70">Получатели загружены из сохранённой аудитории, версия {audience.audienceVersion}. Состав меняется в общей базе выше. Изменение состава потребует нового подтверждения кампании.</p>}
      <div className="z-20 rounded-2xl border border-brand-cyan/25 bg-[#07101d]/95 p-3 shadow-[0_18px_50px_-30px_rgba(47,230,209,.75)] backdrop-blur 2xl:sticky 2xl:top-4" role="region" aria-label="Быстрые действия Telegram-кампании">
        <div className="grid gap-3 2xl:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-brand-cyan/20 bg-brand-cyan/[0.07] text-brand-cyan" aria-hidden="true">
                {connected ? <CheckCircle2 size={21} /> : <MessageCircle size={21} />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">1. Подключите отдельный Telegram-аккаунт</p>
                <p id={accountQuickStatusId} role="status" aria-live="polite" aria-atomic="true" className="mt-1 text-xs leading-5 text-white/70">{accountQuickStatus}</p>
              </div>
            </div>
            <Button
              id={connectButtonId}
              type="button"
              disabled={accountQuickActionBusy}
              aria-busy={accountBusy || accountLoading}
              aria-describedby={accountQuickStatusId}
              aria-controls={accountQuickActionBlocked ? accountSetupNoticeId : undefined}
              aria-expanded={accountQuickActionBlocked ? accountSetupNoticeVisible : undefined}
              onClick={() => {
                if (accountQuickActionBlocked) explainBlockedAccountAction();
                else if (canRequestConnection) void connectAccount();
                else revealSection(accountSectionRef);
              }}
              className="min-h-12 w-full shrink-0 sm:w-auto"
            >
              {accountBusy || accountLoading
                ? <LoaderCircle size={17} className="motion-safe:animate-spin" aria-hidden="true" />
                : connected
                  ? <CheckCircle2 size={17} aria-hidden="true" />
                  : <Phone size={17} aria-hidden="true" />}
              {accountQuickActionLabel}
            </Button>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-brand-cyan/20 bg-brand-cyan/[0.07] text-brand-cyan" aria-hidden="true">
                <UsersRound size={21} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">2. Выберите получателей</p>
                <p className="mt-1 text-xs font-medium tabular-nums text-white" role="status">Выбрано для проверки: {selectedLeadIds.size}</p>
                <dl className="mt-2 grid grid-cols-3 gap-2" aria-label="Сводка найденных компаний">
                  <div className="rounded-lg border border-white/[0.07] bg-[#05070d]/35 px-2 py-1.5"><dt className="text-[10px] leading-4 text-white/55">Найдено</dt><dd className="text-sm font-semibold tabular-nums text-white">{uniqueFoundLeadCount}</dd></div>
                  <div className="rounded-lg border border-white/[0.07] bg-[#05070d]/35 px-2 py-1.5"><dt className="text-[10px] leading-4 text-white/55">С Telegram</dt><dd className="text-sm font-semibold tabular-nums text-white">{telegramLeadCount}</dd></div>
                  <div className="rounded-lg border border-white/[0.07] bg-[#05070d]/35 px-2 py-1.5"><dt className="text-[10px] leading-4 text-white/75">{serverSelection ? 'Подтверждены сервером' : 'Проверены Bridge'}</dt><dd className="text-sm font-semibold tabular-nums text-white">{automaticLeadCount}</dd></div>
                </dl>
                <p id={bulkSelectionStatusId} role="status" aria-live="polite" aria-atomic="true" className="mt-1 text-xs leading-5 text-white/70">{bulkSelectionStatus}</p>
              </div>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
              <Button
                type="button"
                variant="secondary"
                disabled={bulkFoundSelectDisabled}
                aria-describedby={bulkSelectionStatusId}
                onClick={() => {
                  selectAllFound();
                  revealSection(selectionSectionRef);
                }}
                className="min-h-12 w-full sm:w-auto"
              >
                <UsersRound size={17} aria-hidden="true" />
                {allFoundSelected ? `Все контакты выбраны (${foundSelectionIds.length})` : `Выбрать все: мобильный или username (${foundSelectionIds.length})`}
              </Button>
              {readySelectionIds.length > 0 && (
                <Button type="button" variant="secondary" disabled={bulkReadySelectDisabled} aria-describedby={bulkSelectionStatusId} onClick={selectAllReady} className="min-h-12 w-full sm:w-auto">
                  <ShieldCheck size={17} aria-hidden="true" />{allReadySelected ? `Подтверждённые Telegram выбраны (${readySelectionIds.length})` : `Только проверенные Bridge (${readySelectionIds.length})`}
                </Button>
              )}
              <Button type="button" variant="ghost" disabled={bulkClearDisabled} aria-describedby={bulkSelectionStatusId} onClick={clearAllSelection} className="min-h-12 w-full sm:w-auto">
                Снять весь выбор{selectedLeadIds.size > 0 ? ` (${selectedLeadIds.size})` : ''}
              </Button>
            </div>
          </div>
        </div>
        {accountSetupNoticeVisible && accountQuickActionBlocked && (
          <div id={accountSetupNoticeId} ref={accountSetupNoticeRef} tabIndex={-1} role="alert" className="mt-3 flex items-start gap-3 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-200" aria-hidden="true" />
            <p><strong className="text-white">Подключение пока не запускается.</strong> {accountBlockingExplanation}</p>
          </div>
        )}
      </div>

      <Card className="overflow-hidden border-brand-cyan/15 bg-[#08111f]/88 p-0">
        <div className="border-b border-white/[0.07] bg-[linear-gradient(135deg,rgba(47,230,209,.08),rgba(34,158,217,.04))] p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-cyan">Управляемая кампания</p>
              <h2 id={headingId} className="mt-1 text-xl font-semibold text-white">Отдельный Telegram-аккаунт</h2>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Выберите до 50 компаний и запустите одну кампанию. Сообщения обрабатываются последовательно; Pause и Stop доступны в любой момент. Во время рассылки компьютер и локальный Bridge должны быть включены.
              </p>
              <p className="mt-1 text-xs leading-5 text-white/55">
                Серверный лимит: до {telegramCampaignDailyLimit} сообщений за UTC-сутки, интервал — не меньше {telegramCampaignMinimumIntervalSeconds} секунд.
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
              <p><strong className="text-white">Контур отправки ещё не активирован.</strong> Вы можете выбрать до 50 компаний и подготовить оффер сейчас. {!telegramAccountEnabled ? 'Подключение аккаунта, серверная проверка и запуск' : !campaignOutreachEnabled ? 'Серверная проверка и запуск' : 'Запуск'} остаются заблокированы до отдельного разрешения.</p>
            </div>
          )}

          {telegramAccountEnabled && (
            <div className="rounded-2xl border border-brand-cyan/20 bg-brand-cyan/[0.035] p-4" role="region" aria-label="Привязка локального Telegram Bridge">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">Локальный Telegram Bridge</h3>
                    <Badge tone={bridgeStatusCopy.tone}>{bridgeStatusCopy.label}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-white/65">{bridgeStatusCopy.detail} Telegram API hash, 2FA и сессия остаются только в защищённом хранилище Windows.</p>
                  {bridgeDevice?.label && <p className="mt-1 text-xs text-white/50">{bridgeDevice.label}{bridgeDevice.version ? ` · версия ${bridgeDevice.version}` : ''}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {bridgeNeedsPairing && !bridgePairing && (
                    <Button type="button" disabled={bridgePairingBusy} aria-busy={bridgePairingBusy} onClick={() => { void createBridgePairing(); }} className="min-h-12 shrink-0">
                      {bridgePairingBusy ? <LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : <Unplug size={16} aria-hidden="true" />}
                      {bridgePairingBusy ? 'Создаём привязку…' : 'Привязать этот компьютер'}
                    </Button>
                  )}
                  {canRevokeBridge && !bridgeRevokeConfirmation && (
                    <Button type="button" variant="secondary" disabled={bridgePairingBusy} onClick={() => setBridgeRevokeConfirmation(true)} className="min-h-12 shrink-0">
                      <Unplug size={16} aria-hidden="true" />Отвязать Bridge
                    </Button>
                  )}
                </div>
              </div>
              {bridgePairing && (
                <div className="mt-4 rounded-xl border border-amber-300/18 bg-[#05070d]/45 p-3">
                  <p className="text-sm font-medium text-white">Одноразовая привязка готова до {formatDate(bridgePairing.expiresAt)} · осталось {bridgePairingRemainingLabel}</p>
                  <p className="mt-1 text-xs leading-5 text-white/60">Нажмите «Скопировать и открыть Bridge»: код попадёт только в локальный буфер Windows, а программа вставит его автоматически. Секрет не передаётся через ссылку или командную строку.</p>
                  <textarea
                    readOnly
                    value={bridgePairing.enrollmentCode}
                    aria-label="Одноразовый код привязки Telegram Bridge"
                    onFocus={(event) => event.currentTarget.select()}
                    className="mt-3 min-h-20 w-full resize-none rounded-xl border border-white/[0.1] bg-[#05070d] p-3 font-mono text-[11px] leading-5 text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                  />
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <a href={bridgePairing.enrollmentUri} onClick={(event) => { event.preventDefault(); void openBridgeWithPairingCode(); }} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-cyan px-4 py-2 text-sm font-semibold text-[#031013] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                      <ExternalLink size={16} aria-hidden="true" />Скопировать и открыть Bridge
                    </a>
                    <Button type="button" variant="secondary" onClick={() => { void copyBridgePairingCode(); }} className="min-h-12">Скопировать код</Button>
                  </div>
                </div>
              )}
              {canRevokeBridge && bridgeRevokeConfirmation && (
                <div role="group" aria-label="Подтверждение отвязки Telegram Bridge" className="mt-4 rounded-xl border border-rose-300/18 bg-rose-400/[0.045] p-3">
                  <p className="text-sm leading-6 text-rose-50/85">Отвязать именно компьютер «{bridgeDevice?.label ?? 'Lead Radar Bridge'}»? Новый компьютер можно будет привязать только после локального подтверждения удаления. Telegram-аккаунт должен быть предварительно отключён.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" variant="danger" disabled={bridgePairingBusy} aria-busy={bridgePairingBusy} onClick={() => { void revokeBridgeDevice(); }} className="min-h-12">
                      {bridgePairingBusy ? <LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : <Unplug size={16} aria-hidden="true" />}
                      {bridgePairingBusy ? 'Отвязываем…' : 'Подтвердить отвязку'}
                    </Button>
                    <Button type="button" variant="secondary" disabled={bridgePairingBusy} onClick={() => setBridgeRevokeConfirmation(false)} className="min-h-12">Отмена</Button>
                  </div>
                </div>
              )}
              {bridgePairingNotice && <p role="status" aria-live="polite" aria-atomic="true" className="mt-3 text-xs leading-5 text-amber-50/80">{bridgePairingNotice}</p>}
            </div>
          )}

          {telegramAccountEnabled && (
            <div id={accountSectionId} ref={accountSectionRef} tabIndex={-1} className="grid scroll-mt-28 gap-4 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.018] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Состояние аккаунта</h3>
                    <p className="mt-1 text-xs leading-5 text-white/60">Telegram-сессия хранится только локально в защищённом хранилище Windows. Cloudflare и браузер её не получают.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" disabled={accountLoading || accountBusy} onClick={() => { void loadAccount(); }} className="min-h-12">
                      <RefreshCw size={16} className={accountLoading ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />Статус
                    </Button>
                    {canRequestConnection && (
                      <Button type="button" disabled={accountBusy || accountLoading} aria-busy={accountBusy} onClick={() => { void connectAccount(); }} className="min-h-12">
                        {accountBusy ? <LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : <Phone size={16} aria-hidden="true" />}
                        {accountBusy ? 'Подключаем…' : accountStatus === 'disconnected' || accountStatus === 'revoked' ? 'Подключить аккаунт' : 'Переподключить'}
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
                    {campaign && <label className={`flex min-h-12 items-start gap-3 rounded-xl border p-3 text-sm leading-6 ${accountIdentityAvailable && !account.identityReviewRequired ? 'cursor-pointer border-brand-cyan/25 bg-brand-cyan/[0.04] text-white/85' : 'cursor-not-allowed border-amber-300/20 bg-amber-300/[0.04] text-amber-50/80'}`}>
                      <input
                        type="checkbox"
                        checked={accountIdentityConfirmed}
                        disabled={!accountIdentityAvailable || Boolean(account.identityReviewRequired) || accountBusy}
                        onChange={(event) => setAccountIdentityConfirmed(event.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-[#2fe6d1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                      />
                      <span><strong className="block text-white">Это нужный аккаунт для текущей кампании</strong>Подтверждение действует только для этой подключённой сессии и сбрасывается после переподключения.</span>
                    </label>}
                    {!campaign && <p className="text-sm text-white/70">Сверьте отправителя в итоговом просмотре. Нажатие «Подтвердить и запустить» подтвердит аккаунт и точный состав одной кнопкой.</p>}
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
                {authProgress && (
                  <p role="status" aria-live="polite" className="mt-3 rounded-xl border border-brand-cyan/20 bg-brand-cyan/[0.04] p-3 text-sm leading-6 text-white/85">{authProgress}</p>
                )}
                {account && (Boolean(accountConnectionId) || account.status === 'pending' || account.status === 'connecting') && !disconnectConfirmation && (
                  <button id={disconnectButtonId} type="button" disabled={accountBusy || accountLoading} onClick={() => setDisconnectConfirmation(true)} className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-xl px-3 text-sm font-medium text-white/70 hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-50">
                    <Unplug size={16} aria-hidden="true" />{account.status === 'pending' || account.status === 'connecting' ? 'Отменить подключение' : 'Отключить аккаунт'}
                  </button>
                )}
                {disconnectConfirmation && (
                  <div ref={disconnectConfirmationRef} tabIndex={-1} role="group" aria-label="Подтверждение отключения Telegram-аккаунта" className="mt-3 rounded-xl border border-rose-300/18 bg-rose-400/[0.045] p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
                    <p className="text-sm leading-6 text-rose-50/85">{account?.status === 'pending' || account?.status === 'connecting' ? 'Код входа станет недействительным, незавершённое подключение будет отменено. Сообщения не отправлялись.' : 'Отключение немедленно блокирует новые отправки и просит локальный Bridge удалить Telegram-сессию.'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="danger" disabled={accountBusy || accountLoading} onClick={() => { void disconnectAccount(); }} className="min-h-12">{account?.status === 'pending' || account?.status === 'connecting' ? 'Отменить подключение' : 'Подтвердить отключение'}</Button>
                      <Button type="button" variant="secondary" disabled={accountBusy || accountLoading} onClick={() => { setDisconnectConfirmation(false); restoreFocus(disconnectButtonId); }} className="min-h-12">Вернуться</Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid min-h-44 place-items-center rounded-2xl border border-white/[0.08] bg-[#05070d]/55 p-4 text-center">
                {connectStarting || (pendingConnection && !qrExpired && (awaitingPhone || awaitingCode || account?.authState === 'starting')) ? (
                  <TelegramPhoneAuthForm
                    key={awaitingCode ? 'code' : 'phone'}
                    challenge={pendingConnection ? account?.qr ?? null : null}
                    disabled={accountLoading || accountBusy}
                    pending={Boolean(account?.pendingAction)}
                    onBusyChange={changeAccountBusy}
                    onResolved={(next) => {
                      setAccountClock(Date.now());
                      setAccount(next);
                      setAccountNotice(null);
                    }}
                  />
                ) : account?.status === 'connecting' || account?.status === 'pending' ? (
                  qrExpired ? (
                    <div role="status" aria-live="polite" aria-atomic="true" className="max-w-xs">
                      <Clock3 size={36} className="mx-auto text-amber-200" aria-hidden="true" />
                      <p className="mt-3 text-sm font-medium text-white">Срок входа истёк</p>
                      <p className="mt-1 text-xs leading-5 text-white/60">Отмените истёкшее подключение и начните заново. Старый код больше не используется; сообщения не отправлялись.</p>
                    </div>
                  ) : awaitingTwoFactorPassword && account.qr?.authId ? (
                    <TelegramTwoFactorPasswordForm
                      key={account.qr.authId}
                      challenge={account.qr}
                      disabled={accountLoading || accountBusy || Boolean(account.pendingAction)}
                      onBusyChange={changeAccountBusy}
                      onResolved={(next) => {
                        setAccountClock(Date.now());
                        setAccount(next);
                        setAccountNotice(next.status === 'connected'
                          ? 'Telegram подтвердил пароль и подключение аккаунта.'
                          : null);
                      }}
                    />
                  ) : safeQr || safeQrLoginUrl ? (
                    <div className="w-full">
                      {safeQr ? (
                        <img src={safeQr} alt="QR-код для подключения выделенного Telegram-аккаунта" className="mx-auto h-44 w-44 rounded-xl bg-white p-2" />
                      ) : (
                        <QrCode size={36} className="mx-auto text-brand-cyan" aria-hidden="true" />
                      )}
                      <p className="mt-3 text-sm text-white/70">{safeQr ? <>QR создан локальным Bridge и расшифрован только в этой вкладке. В Telegram откройте <strong className="text-white">Настройки → Устройства → Подключить устройство</strong>.</> : 'Зашифрованный QR ещё готовится. Короткоживущую ссылку можно открыть на устройстве с Telegram.'}</p>
                      <p className="mt-1 text-xs text-white/60">QR действует до {formatDate(account.qr?.expiresAt ?? null)}</p>
                      {safeQrLoginUrl && (
                        <a href={safeQrLoginUrl} target="_blank" rel="noreferrer" className="mx-auto mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-brand-cyan/30 bg-brand-cyan/[0.07] px-4 py-2 text-sm font-semibold text-white hover:bg-brand-cyan/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan sm:w-auto">
                          <ExternalLink size={16} aria-hidden="true" />Открыть в Telegram на этом устройстве
                        </a>
                      )}
                      {(safeQr || safeQrLoginUrl) && <p className="mt-2 text-xs leading-5 text-white/55">QR и ссылка существуют только в памяти этой вкладки до истечения срока. Cloudflare хранит лишь шифротекст и не может их прочитать.</p>}
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
                      <Phone size={36} className="mx-auto text-brand-cyan" aria-hidden="true" />
                      <p className="mt-3 text-sm font-medium text-white">{account.authState === 'finalizing' ? 'Сохраняем подтверждённое подключение' : 'Готовим форму номера'}</p>
                      <p className="mt-1 text-xs leading-5 text-white/60">{account.authState === 'finalizing' ? 'Telegram принял вход. Ждём подтверждения защищённого хранилища Bridge; отправка пока закрыта.' : 'Bridge забирает команду с компьютера. Форма появится автоматически; код можно запросить после ввода номера.'}</p>
                    </div>
                  )
                ) : connected ? (
                  <div>
                    <CheckCircle2 size={36} className="mx-auto text-emerald-300" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-white">Telegram подключён</p>
                    <p className="mt-1 text-xs leading-5 text-white/60">Можно подготовить точный список кампании.</p>
                  </div>
                ) : (
                  <div>
                    <Phone size={36} className="mx-auto text-white/35" aria-hidden="true" />
                    <p className="mt-3 text-xs leading-5 text-white/55">Нажмите «Подключить аккаунт», затем введите номер и код из Telegram.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="h-px bg-white/[0.07]" aria-hidden="true" />

          {campaign && isCampaignTerminal(campaign.status) && (
            <div role="note" className="flex flex-col gap-3 rounded-xl border border-brand-cyan/25 bg-brand-cyan/[0.055] p-4 text-sm leading-6 text-white/80 sm:flex-row sm:items-center sm:justify-between">
              <p><strong className="text-white">Редактор показывает завершённую кампанию и поэтому защищён от случайного изменения.</strong> Закройте её карточку — история сохранится на сервере, а текст, выбор компаний и изображение станут доступны для новой рассылки.</p>
              <Button type="button" disabled={operationBusy} onClick={startNewDraftAfterTerminalCampaign} className="min-h-12 shrink-0">Редактировать новый оффер</Button>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.1fr)]">
            <fieldset disabled={operationBusy || !campaignRecoveryReady || Boolean(campaign)} id={selectionSectionId} ref={selectionSectionRef} tabIndex={-1} className="min-w-0 scroll-mt-28 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
              <legend className="text-sm font-semibold text-white">1. Выберите компании</legend>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm leading-5 text-white/80">Выбрано для проверки: <span className="font-semibold tabular-nums text-white">{selectedLeadIds.size}</span>. В кампании — до 50 допущенных адресатов.</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" disabled={bulkFoundSelectDisabled} aria-describedby={bulkSelectionStatusId} onClick={selectAllFound} className="min-h-12">
                    <UsersRound size={16} aria-hidden="true" />{allFoundSelected ? `Все контакты выбраны (${foundSelectionIds.length})` : `Выбрать все: мобильный или username (${foundSelectionIds.length})`}
                  </Button>
                  {readySelectionIds.length > 0 && (
                    <Button type="button" variant="secondary" disabled={bulkReadySelectDisabled} aria-describedby={bulkSelectionStatusId} onClick={selectAllReady} className="min-h-12">
                      <ShieldCheck size={16} aria-hidden="true" />{allReadySelected ? `Подтверждённые Telegram выбраны (${readySelectionIds.length})` : `Только проверенные Bridge (${readySelectionIds.length})`}
                    </Button>
                  )}
                  <Button type="button" variant="ghost" disabled={bulkClearDisabled} aria-describedby={bulkSelectionStatusId} onClick={clearAllSelection} className="min-h-12">Снять весь выбор{selectedLeadIds.size > 0 ? ` (${selectedLeadIds.size})` : ''}</Button>
                </div>
              </div>
              <CampaignReadiness ref={readinessRef} scope={`${searchId}:${audienceId ?? ''}:${accountConnectionId ?? ''}`}
                leads={selectedLeads} excludedIds={excludedRecipientIds} basis={contactBasis} canCheck={connected}
                disabled={operationBusy || Boolean(campaign)} revision={authorizedLeadIds.size}
                onUpdated={onContactsUpdated} onSnapshot={setServerSelection}
                onSelectReady={(ids) => { setSelectedLeadIds(new Set(ids)); invalidatePreparation(); }} />
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1" aria-label="Компании для Telegram-кампании">
                {leads.map((lead) => {
                  const local = classifyCampaignLeadLocally(lead);
                  const selectable = recipientContactChoices(lead).selectable;
                  const strictContact = verifiedTelegramContactChoices(lead);
                  const checked = serverSelection?.selection.items.find((item) => item.companyId === lead.id);
                  const copy = checked ? { label: checked.classification === 'automatic' ? 'Подтверждён сервером' : checked.reasonCode === 'documented_basis_required' ? 'Нужно основание' : 'Не допущен',
                    tone: checked.classification === 'automatic' ? 'success' as const : 'warning' as const }
                    : selectable && local.reason==='missing_telegram' ? {label:'Проверить Telegram',tone:'warning' as const} : LOCAL_CLASSIFICATION_COPY[local.classification];
                  return (
                    <label key={lead.id} className={`flex min-h-12 items-start gap-3 rounded-xl border p-3 transition-colors motion-reduce:transition-none ${selectable ? 'cursor-pointer border-white/[0.08] hover:bg-white/[0.025]' : 'cursor-not-allowed border-rose-300/10 bg-rose-400/[0.025]'}`}>
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.has(lead.id)}
                        disabled={Boolean(audience) || !selectable || operationBusy || Boolean(campaign)}
                        onChange={() => toggleLead(lead)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-[#2fe6d1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white/80">{lead.name}</span>
                        {selectable && <span className="mt-1 block break-words text-sm text-brand-cyan">{strictContact.selectable ? verifiedTelegramContactSummary(lead) : recipientContactSummary(lead)}</span>}
                        <span className="mt-1 block text-[11px] text-white/50">{lead.city} · {lead.priority}</span>
                        <span className="mt-1 block text-xs leading-5 text-white/80">{checked ? SERVER_REASON_COPY[checked.reasonCode] ?? checked.reasonCode
                          : selectable && local.reason==='missing_telegram' ? 'Мобильный номер найден. Telegram ещё не подтверждён; до проверки отправка недоступна.' : LOCAL_REASON_COPY[local.reason]}</span>
                      </span>
                      <Badge tone={copy.tone}>{copy.label}</Badge>
                    </label>
                  );
                })}
              </div>
              {leads.length === 0 && <p className="mt-3 rounded-xl border border-dashed border-white/[0.1] p-4 text-sm text-white/55">Сначала дождитесь найденных компаний.</p>}
              <p className="mt-3 text-xs leading-5 text-white/65">{bulkSelectionStatus} Записи «Не связываться» не попадают даже в черновик. Компании без подтверждённого Telegram остаются только кандидатами и исключаются сервером до отправки.</p>
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
                  aria-describedby={`${composerHelpId}${!campaignRecoveryReady && !campaign ? ` ${composerHelpId}-recovery` : ''}${templateIssue ? ` ${composerHelpId}-error` : ''}`}
                  aria-errormessage={templateIssue ? `${composerHelpId}-error` : undefined}
                  aria-invalid={Boolean(templateIssue)}
                  onChange={(event) => updateTemplate(event.target.value)}
                  className="min-h-48 resize-y"
                />
                <div id={composerHelpId} className="mt-2 flex flex-col gap-1 text-xs leading-5 text-white/60 sm:flex-row sm:items-center sm:justify-between">
                  <span>Разрешённая переменная: {'{company_name}'}. Точный текст фиксирует сервер.</span>
                  <span className={`shrink-0 tabular-nums ${template.length > messageLimit ? 'font-semibold text-amber-100' : ''}`} aria-live="polite">{template.length}/{messageLimit}</span>
                </div>
                {!campaignRecoveryReady && !campaign && <p id={`${composerHelpId}-recovery`} className="mt-2 text-xs leading-5 text-amber-100">Текст можно редактировать локально уже сейчас. Серверная проверка и запуск останутся заблокированы до восстановления состояния кампании.</p>}
                {templateIssue && <p id={`${composerHelpId}-error`} className="mt-2 text-sm leading-5 text-amber-100">{templateIssue}</p>}
              </div>

              <div className="mt-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Изображение к сообщению</h4>
                    <p id={imageHelpId} className="mt-1 text-xs leading-5 text-white/65">Одно статичное JPEG, PNG или WebP до {formatImageSize(LEAD_RADAR_CAMPAIGN_IMAGE_MAX_BYTES)}. После выбора изображение автоматически загружается в защищённый черновик. Сообщения не отправляются.</p>
                  </div>
                  <span className="text-xs text-white/55">Необязательно</span>
                </div>
                <div
                  role="group"
                  aria-label="Выбор изображения для Telegram-кампании"
                  aria-describedby={`${imageHelpId}${mediaNotice ? ` ${imageStatusId}` : ''}`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    if (!operationBusy && !campaign && !mediaBusy) setImageDragActive(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setImageDragActive(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setImageDragActive(false);
                    if (operationBusy || campaign || mediaBusy) return;
                    if (event.dataTransfer.files.length !== 1) {
                      setMediaError(true);
                      setMediaNotice('Можно прикрепить только одно изображение. Выберите один файл.');
                      return;
                    }
                    void selectCampaignImage(event.dataTransfer.files.item(0));
                  }}
                  className={`mt-3 rounded-2xl border border-dashed p-4 transition-colors motion-reduce:transition-none ${imageDragActive ? 'border-brand-cyan bg-brand-cyan/[0.08]' : 'border-white/[0.14] bg-[#05070d]/35'}`}
                >
                  <input
                    ref={imageInputRef}
                    id={imageInputId}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    tabIndex={-1}
                    disabled={operationBusy || !campaignRecoveryReady || Boolean(campaign) || mediaBusy}
                    aria-describedby={`${imageHelpId}${mediaNotice ? ` ${imageStatusId}` : ''}`}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.item(0) ?? null;
                      event.currentTarget.value = '';
                      void selectCampaignImage(file);
                    }}
                    className="sr-only"
                  />
                  {!imagePreviewUrl && !uploadedMedia ? (
                    <div className="flex flex-col items-center text-center">
                      {mediaState === 'validating'
                        ? <LoaderCircle size={32} className="text-brand-cyan motion-safe:animate-spin" aria-hidden="true" />
                        : <ImagePlus size={32} className="text-brand-cyan" aria-hidden="true" />}
                      <p className="mt-2 text-sm font-medium text-white">Перетащите сюда макет сайта</p>
                      <p className="mt-1 text-xs leading-5 text-white/55">или выберите файл на устройстве</p>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={operationBusy || !campaignRecoveryReady || Boolean(campaign) || mediaBusy}
                        onClick={() => imageInputRef.current?.click()}
                        className="mt-3 min-h-12"
                      >
                        <ImagePlus size={17} aria-hidden="true" />Выбрать изображение
                      </Button>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                      {imagePreviewUrl ? <img
                        src={imagePreviewUrl}
                        alt={`Предпросмотр изображения «${imageFile?.name ?? 'макет'}» для Telegram-сообщения`}
                        className="max-h-72 w-full rounded-xl border border-white/[0.1] bg-white object-contain"
                      /> : <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-white/10 p-3 text-sm text-white/70">
                        {previewIssue ? 'Не удалось восстановить предпросмотр. Защищённая копия не удалена.' : 'Восстанавливаем защищённый предпросмотр…'}
                        {previewIssue && <Button type="button" variant="secondary" onClick={() => setPreviewRetry((value) => value + 1)}>Повторить предпросмотр</Button>}
                      </div>}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{imageFile?.name ?? uploadedMedia?.filename}</p>
                        {imageFile && <p className="mt-1 text-xs text-white/60">{formatImageSize(imageFile.size)} · {imageFile.type.replace('image/', '').toUpperCase()}</p>}
                        <p className="mt-2 text-xs leading-5 text-white/65">
                          {mediaState === 'uploaded'
                            ? 'Загружено в защищённый черновик. Отправка начнётся только после проверки и отдельного запуска кампании.'
                            : mediaState === 'checking'
                              ? 'Bridge проверяет сохранённое изображение в фоне. Повторно загружать файл не нужно.'
                            : mediaState === 'uploading'
                              ? 'Загрузка выполняется. Кампания ещё не создана и сообщение не отправляется.'
                              : 'Изображение ещё не загружено. При ошибке нажмите «Повторить загрузку»; без него отправка заблокирована.'}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {mediaState !== 'uploaded' && (
                            <Button type="button" disabled={mediaBusy} onClick={() => {
                              if (uploadedMedia && mediaState !== 'ready' && (!imageFile || uploadedMedia.validation?.status === 'pending')) {
                                mediaCheckStartedAt.current = Date.now(); setMediaError(false); setMediaState('checking');
                              } else void uploadCampaignImage();
                            }} className="min-h-12">
                              {mediaState === 'uploading' ? <LoaderCircle size={17} className="motion-safe:animate-spin" aria-hidden="true" /> : <UploadCloud size={17} aria-hidden="true" />}
                              {mediaState === 'checking' ? 'Bridge проверяет…' : mediaState === 'uploading' ? `Загрузка ${mediaProgress}%` : uploadedMedia && mediaState !== 'ready' && (!imageFile || uploadedMedia.validation?.status === 'pending') ? 'Продолжить проверку' : uploadedMedia ? 'Загрузить замену' : mediaState === 'error' ? 'Повторить загрузку' : 'Загрузить изображение'}
                            </Button>
                          )}
                          <Button type="button" variant="secondary" disabled={mediaBusy} onClick={() => imageInputRef.current?.click()} className="min-h-12">
                            <ImagePlus size={17} aria-hidden="true" />Заменить
                          </Button>
                          <Button type="button" variant="ghost" disabled={mediaBusy} onClick={() => { void removeCampaignImage(); }} className="min-h-12">
                            <Trash2 size={17} aria-hidden="true" />Удалить
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {mediaState === 'uploading' && (
                  <div className="mt-3">
                    <div role="progressbar" aria-label="Загрузка изображения" aria-valuemin={0} aria-valuemax={100} aria-valuenow={mediaProgress} className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
                      <div className="h-full bg-brand-cyan transition-[width] motion-reduce:transition-none" style={{ width: `${mediaProgress}%` }} />
                    </div>
                    <p className="mt-2 text-xs tabular-nums text-white/60">Загружено {mediaProgress}%</p>
                  </div>
                )}
                {mediaNotice && (
                  <p id={imageStatusId} role={mediaError ? 'alert' : 'status'} aria-live={mediaError ? 'assertive' : 'polite'} aria-atomic="true" className={`mt-3 rounded-xl border p-3 text-xs leading-5 ${mediaError ? 'border-amber-300/18 bg-amber-300/[0.04] text-amber-50/90' : 'border-white/[0.08] bg-white/[0.018] text-white/70'}`}>
                    {mediaNotice}
                  </p>
                )}
              </div>

              <div
                className="mt-4 rounded-2xl border border-white/[0.09] bg-[#05070d]/55 p-3"
                aria-label={hasImageAttachment
                  ? 'Точный предпросмотр подписи и ориентировочный предпросмотр изображения Telegram-сообщения'
                  : 'Точный предпросмотр текста Telegram-сообщения'}
              >
                <div className="flex items-center justify-between gap-3">
                  <h4 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-white/65">Предпросмотр сообщения{composerPreviewCompany ? ` · ${composerPreviewCompany}` : ''}</h4>
                  <span className="text-[11px] text-white/50">
                    {hasImageAttachment ? 'подпись к фото' : 'обычный текст'}
                  </span>
                </div>
                {imagePreviewUrl && <img src={imagePreviewUrl} alt="Изображение в предпросмотре Telegram-сообщения" className="mt-3 max-h-80 w-full rounded-xl bg-white object-contain" />}
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-white/85">{composerPreviewText || 'Текст сообщения появится здесь.'}</p>
                <p className="mt-2 text-xs leading-5 text-white/55">
                  {hasImageAttachment
                    ? 'Текст ниже — точная подпись. Изображение показано ориентировочно: перед отправкой оно безопасно очищается и перекодируется, а Telegram может дополнительно его сжать. '
                    : 'Текст ниже отправится без скрытого форматирования. '}
                  Переносы строк и emoji сохраняются; Markdown и HTML не интерпретируются.
                </p>
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
                    saveCampaignBasisDraft(searchId, event.target.value);
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

              {contactBasis && authorizationNeededCandidates.length > 0 && (
                <details className="mt-4 rounded-xl border border-white/[0.09] bg-white/[0.018]">
                  <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3 text-sm font-medium text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-cyan">
                    <span>Подтвердить основание для компании</span>
                    <span className="shrink-0 text-xs font-normal text-white/65">Требуют основания: {authorizationNeededCandidates.length}</span>
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
                        {authorizationNeededCandidates.map((lead) => (
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
                  <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.035] p-3"><div className="text-[10px] uppercase text-white/50">{serverSelection ? 'Подтверждены сервером' : 'Кандидаты авто'}</div><div className="mt-1 text-xl font-semibold tabular-nums text-emerald-200">{displayedSelection.automatic}</div></div>
                  <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-3"><div className="text-[10px] uppercase text-white/50">Проверка / основание</div><div className="mt-1 text-xl font-semibold tabular-nums text-amber-100">{displayedSelection.manual}</div></div>
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.018] p-3"><div className="text-[10px] uppercase text-white/50">Исключатся</div><div className="mt-1 text-xl font-semibold tabular-nums text-white/75">{displayedSelection.excluded}</div></div>
                </div>
              )}

              <p role="note" className="mt-3 text-sm leading-6 text-white/70">Одна подготовка проверит Telegram, основания, ограничения и точный текст. Ничего не отправится до финального запуска.</p>

              <Button
                type="button"
                size="lg"
                disabled={!campaignOutreachEnabled || Boolean(audienceSyncIssue) || !campaignRecoveryReady || selectedLeadIds.size === 0 || mediaBusy || operationBusy || Boolean(campaign)}
                aria-busy={operationBusy && !preparation}
                onClick={() => { void prepareCampaign(); }}
                className="mt-4 min-h-12 w-full"
              >
                {operationBusy && !preparation ? <LoaderCircle size={17} className="motion-safe:animate-spin" aria-hidden="true" /> : <ShieldCheck size={17} aria-hidden="true" />}
                {operationBusy ? 'Подготавливаем…' : 'Подготовить рассылку'}
              </Button>
              {operationBusy && preparationInFlight.current && <Button type="button" variant="secondary" className="mt-2 min-h-12 w-full" onClick={() => {
                preparationCancelled.current = true; readinessRef.current?.cancel(); setOperationNotice('Подготовка приостановлена. Ждём окончания текущего запроса; результаты контактов сохранены, отправок нет.');
              }}>Приостановить подготовку</Button>}
              {!campaignOutreachEnabled && <p className="mt-2 text-xs text-amber-100">Подготовка кампаний выключена на сервере. Обновление или повторное сохранение аудитории не включит её.</p>}
              {audienceSyncIssue && <p role="status" className="mt-2 text-xs text-amber-100">{audienceSyncIssue}</p>}
              {selectedLeadIds.size === 0 && <p className="mt-2 text-xs text-amber-100">Сначала выберите компании в аудиторию.</p>}
              {mediaBusy && <p role="status" className="mt-2 text-xs text-white/70">Дождитесь загрузки и проверки изображения.</p>}
            </div>
          </div>

          {preparation && serverSummary && !campaign && (
            <div className="rounded-2xl border border-brand-cyan/18 bg-brand-cyan/[0.035] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 ref={reviewHeadingRef} tabIndex={-1} className="rounded-sm text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">3. Серверная проверка</h3>
                  <p className="mt-1 text-xs leading-5 text-white/60">Подтверждение действует до {formatDate(preparation.expiresAt)}. Любое изменение списка, текста или изображения аннулирует его.</p>
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

              {hasImageAttachment && imagePreviewUrl && (
                <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-[#05070d]/35 p-3 sm:flex-row sm:items-center">
                  <img src={imagePreviewUrl} alt="Изображение, включённое в проверенную Telegram-кампанию" className="h-24 w-full rounded-lg bg-black/30 object-contain sm:w-32" />
                  <div>
                    <p className="text-sm font-medium text-white">Изображение включено во все готовые сообщения</p>
                    <p className="mt-1 text-xs leading-5 text-white/60">Telegram отправит его как photo, а персонализированный текст — подписью под изображением.</p>
                  </div>
                </div>
              )}

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

              {previewComplete && !serverPreviewsFit && (
                <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-300/20 bg-rose-400/[0.045] p-3 text-sm leading-6 text-rose-50/90">
                  <AlertTriangle size={17} className="mt-1 shrink-0" aria-hidden="true" />После персонализации хотя бы одна подпись превышает лимит {messageLimit} символов. Запуск заблокирован; сократите текст и выполните серверную проверку заново.
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

              <div className="mt-4 rounded-xl border border-brand-cyan/25 p-3 text-sm leading-6">
                <p className="font-medium text-white">Отправитель: {accountIdentityLabel ?? 'не подтверждён сервером'}{account?.username ? ` · @${account.username.replace(/^@/, '')}` : account?.phoneMasked ? ` · ${account.phoneMasked}` : ''}</p>
                <p>Нажимая кнопку ниже, вы подтверждаете отправку показанных {serverSummary.automatic} сообщений{hasImageAttachment ? ' с изображением' : ''} именно с этого аккаунта. Основание: {contactBasis ? CONTACT_BASIS_COPY[contactBasis] : 'не выбрано'}.</p>
                <p className="text-white/65">Сервер ещё раз проверит запреты и историю. Пауза и остановка доступны после запуска.</p>
              </div>

              <Button type="button" size="lg" disabled={!createReady} aria-busy={operationBusy} onClick={() => { void createAndStartCampaign(); }} className="mt-4 min-h-12 w-full">
                {operationBusy ? <LoaderCircle size={18} className="motion-safe:animate-spin" aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
                {operationBusy ? 'Создаём кампанию…' : campaignAutoSendEnabled ? `Подтвердить и запустить для ${serverSummary.automatic} компаний` : 'Подтвердить создание без отправки'}
              </Button>
              {hasImageAttachment && !imagePreviewUrl && <p role="status" className="mt-2 text-sm text-amber-100">Для подтверждения восстановите предпросмотр изображения в блоке оффера. Отправка без просмотра недоступна.</p>}
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
                  <Button type="button" variant="ghost" disabled={operationBusy} onClick={startNewDraftAfterTerminalCampaign} className="min-h-12">Подготовить новую</Button>
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
