/**
 * Russian copy and formatting.
 *
 * Two rules worth stating. Raw status keys never reach a screen: `open`,
 * `order_question` and `placed` are how the database talks, and an operator
 * should not have to learn that vocabulary to read a table. And a number always
 * arrives with its noun in the right case - "3 объявления", never "3 объявление"
 * - because the panel is read at a glance and a wrong ending costs a re-read.
 */

const RU = new Intl.NumberFormat('ru-RU');

export function count(value: number): string {
  return RU.format(value);
}

/**
 * Uzbek som.
 *
 * The column is called `price_minor`, and it does not hold a minor unit: the
 * seller types whole som and the number is stored as typed. The proof is in the
 * catalogue itself — a product named "Тестовый товар 1 000 000" carries
 * `price_minor = 1000000` — and in the buyer's own presenter, which prints the
 * stored number followed by "сум" with no division at all
 * (`formatBuyerPrice` in `agents/sotuvchi/buyer/cards.ts`).
 *
 * This used to divide by 100, so every price the panel showed was a hundredth
 * of the price the buyer was quoted. Whatever this function does, it has to
 * agree with the buyer, because they are describing the same row.
 */
export function money(minor: number | null): string {
  if (minor === null) return '—';
  return `${RU.format(Math.round(minor))} сум`;
}

export function plural(value: number, one: string, few: string, many: string): string {
  const abs = Math.abs(value) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

/** Relative for the last day, absolute after that. Both in the reader's zone. */
export function when(iso: string): string {
  const stamp = Date.parse(iso);
  if (!Number.isFinite(stamp)) return '—';
  const minutes = Math.round((Date.now() - stamp) / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} ${plural(minutes, 'минуту', 'минуты', 'минут')} назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${plural(hours, 'час', 'часа', 'часов')} назад`;
  return new Date(stamp).toLocaleString('ru-RU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function exactTime(iso: string): string {
  const stamp = Date.parse(iso);
  if (!Number.isFinite(stamp)) return iso;
  return new Date(stamp).toLocaleString('ru-RU');
}

/** Listing status. The vocabulary the whole panel shares. */
export const LISTING_STATUS: Record<string, string> = {
  published: 'Опубликовано',
  draft: 'Черновик',
  archived: 'В архиве',
};

export const AVAILABILITY: Record<string, string> = {
  available: 'В наличии',
  unavailable: 'Нет в наличии',
  preorder: 'Под заказ',
};

export const STORE_STATUS: Record<string, string> = {
  active: 'Активен',
  suspended: 'Приостановлен',
  paused: 'На паузе',
  archived: 'В архиве',
};

export const ORDER_STATUS: Record<string, string> = {
  draft: 'Черновик',
  placed: 'Новый',
  confirmed: 'Подтверждён',
  done: 'Выполнен',
  cancelled: 'Отменён',
};

export const HANDOFF_STATUS: Record<string, string> = {
  open: 'Ждёт ответа',
  answered: 'Отвечен',
  closed: 'Закрыт',
  expired: 'Истёк',
};

/**
 * ADMIN-4A. The stage filter offers exactly the five words `ORDER_STATUS`
 * names, because those are the five the server derives from (status,
 * fulfillment_status) and it refuses any sixth.
 */
export const ORDER_STAGE_KEYS = Object.keys(ORDER_STATUS);
export const HANDOFF_STATUS_KEYS = Object.keys(HANDOFF_STATUS);

/**
 * Why the agent escalated to a person. The whole of the `reason` CHECK in
 * `sotuvchi_handoffs`, so a row can never arrive with a reason this cannot say.
 */
export const QUESTION_REASON: Record<string, string> = {
  unknown_intent: 'Агент не понял вопрос',
  buyer_requested_human: 'Покупатель попросил человека',
  catalog_no_result: 'В каталоге ничего не нашлось',
  order_question: 'Вопрос по заказу',
  seller_initiated: 'Начал продавец',
};

/** Who the row is waiting on. Derived by the server; the screen only names it. */
export const WAITING_SIDE: Record<string, string> = {
  seller: 'Ждёт продавца',
  buyer: 'Ждёт покупателя',
  nobody: 'Ожидание завершено',
};

/**
 * How loudly a row asks for attention.
 *
 * `waiting` is a queue doing its job and is deliberately quiet: an owner screen
 * that flags every open row flags nothing. `stalled` is the only alarm, and it
 * means one working day has passed with the seller still not having moved.
 */
export const OPERATIONS_ATTENTION: Record<string, string> = {
  none: '',
  waiting: 'В работе',
  stalled: 'Задерживается',
};

/**
 * Owner audit verbs, as a person would say them.
 *
 * This is the whole of `OWNER_AUDIT_ACTIONS` and nothing else. A filter built
 * from a shorter list would quietly hide a kind of event; one built from a
 * longer list would offer a value the server rejects. Both are worse than the
 * raw key, so the two lists are kept identical on purpose.
 */
export const AUDIT_ACTION: Record<string, string> = {
  'store.suspend': 'Магазин приостановлен',
  'store.restore': 'Магазин восстановлен',
  'pilot.activate': 'Пилот включён',
  'pilot.pause': 'Пилот приостановлен',
  'automation.replay': 'Повтор задачи автоматизации',
  'seller.bind': 'Продавцу выдан доступ',
  'seller.unbind': 'У продавца отозван доступ',
  'listing.publish': 'Объявление опубликовано',
  'listing.unpublish': 'Объявление снято с публикации',
  'listing.archive': 'Объявление перемещено в архив',
};

/** Filter order: the destructive pair first, then the reversible ones. */
export const AUDIT_ACTION_KEYS = Object.keys(AUDIT_ACTION);

export const AUDIT_TARGET: Record<string, string> = {
  store: 'магазин',
  job: 'задача',
  org: 'организация',
  automation_job: 'задача автоматизации',
  product: 'объявление',
};

/** The two roles the token may carry. There is no third. */
export const ACTOR_ROLE: Record<string, string> = {
  platform_owner: 'Владелец платформы',
  support_readonly: 'Поддержка, только чтение',
};

export const ACTOR_ROLE_KEYS = Object.keys(ACTOR_ROLE);

/** Mirrors `OWNER_REASON_CODES`. Every code the server accepts has a sentence. */
export const REASON_CODE: Record<string, string> = {
  pilot_onboarding: 'подключение к пилоту',
  pilot_paused_by_owner: 'пилот остановлен владельцем',
  seller_request: 'запрос продавца',
  policy_violation: 'нарушение правил',
  suspected_abuse: 'подозрение на злоупотребление',
  data_quality: 'качество данных',
  incident_response: 'реакция на инцидент',
  operator_error_recovery: 'исправление ошибки оператора',
};

/**
 * Attention items. Each is a sentence about something a person can do, plus
 * where they would go to do it. No item is decorative and none of them appears
 * with a count of zero.
 */
export const ATTENTION: Record<string, { title: string; hint: string }> = {
  handoffs_open: {
    title: 'Вопросы без ответа',
    hint: 'Покупатель ждёт ответа продавца',
  },
  orders_open: {
    title: 'Заказы в работе',
    hint: 'Новые и подтверждённые, ещё не завершены',
  },
  listings_without_photo: {
    title: 'Опубликовано без фото',
    hint: 'Карточка без фотографии почти не открывается',
  },
  listings_without_description: {
    title: 'Опубликовано без описания',
    hint: 'Поиск хуже находит такие карточки',
  },
  listings_without_category: {
    title: 'Без категории',
    hint: 'Не попадает в подборки и фильтры',
  },
  listings_unavailable: {
    title: 'Нет в наличии',
    hint: 'Опубликовано, но купить нельзя',
  },
  stores_suspended: {
    title: 'Приостановленные магазины',
    hint: 'Витрина недоступна покупателям',
  },
  binding_challenge_live: {
    title: 'Открыт код привязки',
    hint: 'Церемония привязки Telegram сейчас активна',
  },
  no_telegram_seller_access: {
    title: 'Ни один Telegram не имеет доступа продавца',
    hint: 'Кабинет магазина недоступен из Mini App, пока нет привязки',
  },
};

/**
 * Card quality, in the three states the server derives.
 *
 * There is no score and no percentage, because nothing measures how a card
 * performs: Bormi records no views, no clicks and no conversions, so any
 * number here would be an opinion wearing a decimal point.
 */
export const QUALITY_STATE: Record<string, string> = {
  good: 'Заполнено',
  needs_attention: 'Можно улучшить',
  incomplete: 'Не хватает главного',
};

export const QUALITY_STATE_KEYS = Object.keys(QUALITY_STATE);

/**
 * Why a card is in that state. Every entry names the field that produced it,
 * and the wording matches the Command Center's attention list so the same
 * problem is not called two things on two screens.
 */
export const QUALITY_REASON: Record<string, string> = {
  no_photo: 'Нет фотографии',
  no_category: 'Не выбрана категория',
  no_description: 'Не заполнено описание',
  unavailable: 'Нет в наличии',
};

/** Media presence, as a filter rather than as a verdict. */
export const MEDIA_FILTER: Record<string, string> = {
  with: 'С фото',
  without: 'Без фото',
};

/** The two orderings the product index can actually answer. */
export const LISTING_SORT: Record<string, string> = {
  name: 'По названию, А–Я',
  name_desc: 'По названию, Я–А',
};

export const LISTING_STATUS_KEYS = Object.keys(LISTING_STATUS);
export const AVAILABILITY_KEYS = Object.keys(AVAILABILITY);

/** The bucket for products that belong to no category. Not a real category. */
export const UNCATEGORISED = 'Без категории';

/**
 * Why a listing command was refused.
 *
 * Every key is a token the server actually returns. A code with no sentence
 * here falls through `label()` and shows as itself, which is ugly but honest —
 * better than a generic "что-то пошло не так" that hides which rule stopped it.
 */
export const COMMAND_ERROR: Record<string, string> = {
  listing_not_found: 'Объявление не найдено. Возможно, его удалил продавец.',
  invalid_listing_transition: 'Для текущего статуса это действие недоступно.',
  store_not_active: 'Магазин не активен, поэтому изменить объявление нельзя.',
  store_owner_unavailable: 'У магазина нет активного владельца — каталог откажет в записи.',
  listing_without_category: 'Нельзя опубликовать: у объявления не выбрана категория.',
  invalid_expected_version: 'Не передана версия объявления.',
  confirmation_mismatch: 'Идентификатор введён неверно.',
  idempotency_conflict: 'Тот же ключ уже использован для другого действия.',
  listing_transition_conflict: 'Объявление изменилось во время выполнения. Обновите экран.',
  invalid_reason_code: 'Причина не из списка.',
  fixture_mode_read_only: 'В демо-режиме действия не выполняются: сервера нет.',
  insufficient_role: 'Недостаточно прав для этого действия.',
  unknown_role: 'Роль сессии не распознана. Войдите заново.',
  unauthenticated: 'Сессия истекла. Войдите заново — действие не выполнено.',
  forbidden: 'Недостаточно прав для этого действия.',
  network_error: 'Сеть недоступна. Действие не выполнено — повторите.',
  internal_error: 'Внутренняя ошибка. Действие не выполнено.',
};

/* ── Classifieds moderation ──────────────────────────────────────────────── */

/**
 * The five moderation states, as a person would say them.
 *
 * `pending` is the only one that means "somebody has to look at this", so it is
 * the only one worded as a queue rather than as a verdict.
 */
export const MODERATION_STATE: Record<string, string> = {
  pending: 'На модерации',
  approved: 'Одобрено',
  rejected: 'Отклонено',
  restricted: 'Ограничено',
  removed: 'Снято',
};

export const MODERATION_STATE_KEYS = Object.keys(MODERATION_STATE);

/**
 * Reason codes a moderator may choose. This is the whole of `MODERATION_REASONS`
 * on the server and nothing else: a shorter list would hide a decision the
 * server accepts, and a longer one would offer a value it refuses.
 *
 * `new_seller_review` and `high_risk_category` are deliberately absent here for
 * the same reason they are absent there — they are why a listing entered the
 * queue, not why a person decided something about it. They still have wording
 * below, because the queue and the history display them.
 */
export const MODERATION_REASON: Record<string, string> = {
  prohibited_item: 'Запрещённый товар',
  suspected_fraud: 'Подозрение на мошенничество',
  duplicate_listing: 'Дубликат объявления',
  misleading_content: 'Вводит в заблуждение',
  unsafe_contact: 'Небезопасный контакт',
  personal_data: 'Персональные данные',
  seller_request: 'Запрос продавца',
  appeal_upheld: 'Апелляция удовлетворена',
  other_policy: 'Иное нарушение правил',
};

export const MODERATION_REASON_KEYS = Object.keys(MODERATION_REASON);

/** Why a listing entered the queue. Shown, never offered as a decision. */
export const MODERATION_ENTRY_REASON: Record<string, string> = {
  new_seller_review: 'Первое объявление продавца',
  high_risk_category: 'Категория повышенного риска',
};

/** Everything `reason_code` may hold, wherever it is read rather than chosen. */
export const ANY_MODERATION_REASON: Record<string, string> = {
  ...MODERATION_ENTRY_REASON,
  ...MODERATION_REASON,
};

/**
 * The moderation audit verbs. This is the whole of the `action` CHECK in
 * `market_moderation_audit`, including the six a seller writes: the history on
 * a listing is one trail, and a row the panel cannot name would show as a raw
 * key in the middle of it.
 */
export const MODERATION_ACTION: Record<string, string> = {
  'listing.submitted': 'Отправлено на модерацию',
  'listing.approved': 'Одобрено модератором',
  'listing.rejected': 'Отклонено модератором',
  'listing.restricted': 'Ограничено модератором',
  'listing.removed': 'Снято модератором',
  'listing.appeal_upheld': 'Апелляция удовлетворена',
  'listing.unpublished': 'Снято продавцом с публикации',
  'listing.republished': 'Возвращено продавцом к публикации',
  'listing.archived': 'Перемещено продавцом в архив',
  'report.opened': 'Поступила жалоба',
  'report.triaged': 'Жалоба взята в работу',
  'report.resolved': 'Жалоба удовлетворена',
  'report.dismissed': 'Жалоба отклонена',
};

/** Who wrote an audit row. There is no third kind of actor. */
export const MODERATION_ACTOR: Record<string, string> = {
  moderator: 'Модератор',
  seller: 'Продавец',
  buyer: 'Покупатель',
  system: 'Система',
};

/**
 * Report reasons. Seven, not nine: a buyer files from a shorter list than a
 * moderator decides from, and the two are not the same vocabulary.
 */
export const REPORT_REASON: Record<string, string> = {
  prohibited_item: 'Запрещённый товар',
  suspected_fraud: 'Мошенничество',
  duplicate_listing: 'Дубликат',
  misleading_content: 'Вводит в заблуждение',
  unsafe_contact: 'Небезопасный контакт',
  personal_data: 'Персональные данные',
  other_policy: 'Иное нарушение правил',
};

export const REPORT_STATUS: Record<string, string> = {
  open: 'Открыта',
  triaged: 'В работе',
  resolved: 'Удовлетворена',
  dismissed: 'Отклонена',
};

export const REPORT_STATUS_KEYS = Object.keys(REPORT_STATUS);

/** What was done to the listing because of the report, if anything. */
export const REPORT_MODERATION_ACTION: Record<string, string> = {
  none: 'Без действия',
  restricted: 'Ограничено',
  removed: 'Снято',
  rejected: 'Отклонено',
};

/** Seller type, in the two words the taxonomy actually has. */
export const SELLER_TYPE: Record<string, string> = {
  private: 'Частное лицо',
  store: 'Магазин',
};

export const SELLER_VERIFICATION: Record<string, string> = {
  unverified: 'Не подтверждён',
  identity_verified: 'Личность подтверждена',
  store_verified: 'Магазин подтверждён',
};

/** The condition allowlist from the global taxonomy. */
export const LISTING_CONDITION: Record<string, string> = {
  new: 'Новое',
  like_new: 'Как новое',
  good: 'Хорошее',
  fair: 'Удовлетворительное',
  for_parts: 'На запчасти',
  not_applicable: 'Не применимо',
};

/**
 * How a buyer may reach the seller. `phone_optional` is a policy, not a number:
 * no telephone is stored on the listing and none is shown here.
 */
export const CONTACT_MODE: Record<string, string> = {
  in_app: 'Только через приложение',
  telegram_relay: 'Через Telegram-ретранслятор',
  phone_optional: 'Телефон — после действия покупателя',
};

/**
 * Why a moderation command was refused.
 *
 * Every key is a token `handleModerationDecision` or `handleReportResolution`
 * actually returns. Anything without a sentence falls through `label()` and
 * shows as itself — ugly, but it names the rule that stopped the command
 * instead of hiding it behind "что-то пошло не так".
 */
export const MODERATION_ERROR: Record<string, string> = {
  listing_not_found: 'Объявление не найдено. Возможно, продавец удалил его.',
  report_not_found: 'Жалоба не найдена.',
  moderation_version_conflict: 'Решение по объявлению уже принято кем-то другим. Экран обновлён — посмотрите заново.',
  report_version_conflict: 'Жалоба изменилась, пока была открыта. Экран обновлён.',
  invalid_moderation_transition: 'Из текущего состояния это решение недоступно.',
  invalid_report_transition: 'Жалоба уже закрыта.',
  invalid_decision: 'Решение не из списка.',
  invalid_resolution: 'Действие по жалобе не из списка.',
  invalid_reason_code: 'Для этого решения нужна причина из списка.',
  invalid_note: 'Комментарий длиннее 500 символов.',
  invalid_expected_version: 'Не передана версия записи.',
  invalid_idempotency_key: 'Не передан ключ операции.',
  idempotency_conflict: 'Тот же ключ уже использован для другого решения.',
  unexpected_field: 'В запросе оказалось лишнее поле.',
  insufficient_role: 'Решения принимает владелец платформы. У вашей роли только чтение.',
  unknown_role: 'Роль сессии не распознана. Войдите заново.',
  unauthenticated: 'Сессия истекла. Войдите заново — решение не применено.',
  fixture_mode_read_only: 'В демо-режиме решения не применяются: сервера нет.',
  network_error: 'Сеть недоступна. Решение не применено — повторите.',
  internal_error: 'Внутренняя ошибка. Решение не применено.',
  storage_unavailable: 'База недоступна. Решение не применено.',
};

export function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}
