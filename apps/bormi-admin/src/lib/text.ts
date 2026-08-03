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

/** Uzbek som, whole units. Minor units are stored; nobody prices in tiyin. */
export function money(minor: number | null): string {
  if (minor === null) return '—';
  return `${RU.format(Math.round(minor / 100))} сум`;
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

/** Owner audit verbs, as a person would say them. */
export const AUDIT_ACTION: Record<string, string> = {
  'store.suspend': 'Магазин приостановлен',
  'store.restore': 'Магазин восстановлен',
  'seller.bind': 'Привязан продавец',
  'automation.replay': 'Повтор задачи автоматизации',
  'pilot.activate': 'Пилот включён',
  'pilot.pause': 'Пилот приостановлен',
};

export const AUDIT_TARGET: Record<string, string> = {
  store: 'магазин',
  job: 'задача',
  org: 'организация',
};

export const REASON_CODE: Record<string, string> = {
  policy_violation: 'нарушение правил',
  seller_request: 'запрос продавца',
  owner_decision: 'решение владельца',
  incident: 'инцидент',
  maintenance: 'обслуживание',
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

export function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}
