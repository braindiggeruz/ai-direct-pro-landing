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
};

/** Filter order: the destructive pair first, then the reversible ones. */
export const AUDIT_ACTION_KEYS = Object.keys(AUDIT_ACTION);

export const AUDIT_TARGET: Record<string, string> = {
  store: 'магазин',
  job: 'задача',
  org: 'организация',
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

export function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}
