import type { TelegramContactResolution } from '../../shared/lead-radar-contact-resolution';

export function contactResolutionCopy(result: TelegramContactResolution): string {
  if (result.reason === 'username_exists_ownership_unconfirmed') return `${result.username ? `Аккаунт @${result.username}` : 'Аккаунт'} найден, но принадлежность компании ещё не подтверждена. Откройте источник и подтвердите его ниже. Отправка недоступна.`;
  if (result.status === 'resolved') return `${result.username ? `Telegram найден: @${result.username}` : 'Telegram найден по номеру, без публичного username'}. Отправка не запускалась; основание для контакта проверяется отдельно.`;
  if (result.status === 'pending') return 'Ждём ответ Bridge. Ничего не отправляем.';
  if (result.reason === 'business_listing_rate_limited') return `OpenStreetMap ограничил запросы (429). Telegram ещё не проверен. Проверка источника доступна не раньше чем через ${result.retryAfterSeconds ?? 900} сек.; найденные данные сохранены.`;
  if (result.reason === 'business_listing_unavailable') return `Карточка компании в источнике временно недоступна. Это не означает, что Telegram отсутствует. Повторная проверка — не раньше чем через ${result.retryAfterSeconds ?? 900} сек.; независимые источники можно проверять отдельно.`;
  if (result.reason === 'bridge_update_required') return 'Нужно обновить локальный Bridge до 1.5.0.';
  if (result.reason === 'bridge_offline') return 'Bridge не в сети. Запустите программу на компьютере; результат Telegram пока неизвестен.';
  if (result.reason === 'telegram_timeout' || result.reason === 'check_expired') return 'Ответ Telegram не получен вовремя. Результат неизвестен, контакт не помечен как отсутствующий. Повторите позже.';
  if (result.reason === 'peer_access_unavailable') return 'Telegram не вернул доступного адресата. Повторите проверку позже; номер не считается готовым к отправке.';
  if (result.reason === 'no_public_username') return 'Аккаунт найден, но доступный адресат для отправки не подтверждён. Перепроверьте контакт через актуальный Bridge.';
  if (result.status === 'limited') return `Проверки временно ограничены. Пауза: ${result.retryAfterSeconds ?? 60} сек. Причина: ${result.reason}. Автоповтора нет.`;
  if (result.reason === 'privacy_or_missing') return 'Проверка не дала результата: контакт может быть скрыт настройками приватности или не зарегистрирован. Отправка закрыта.';
  if (result.reason === 'not_regular_user') return 'Это не обычный аккаунт: бот, группа или канал исключены.';
  if (result.reason === 'corporate_source_required') return 'Нет свежего подтверждения принадлежности контакта компании. Проверьте источник; повтор Telegram сам по себе это не исправит.';
  if (result.reason === 'do_not_contact') return 'Компания в списке «Не связываться». Проверка и отправка исключены.';
  return 'Результат не подтверждён. Проверьте подключение и повторите позже; сообщения не отправлялись.';
}

export function ownershipConfirmationCopy(reason: string): string {
  switch (reason) {
    case 'confirmed': case 'already_confirmed': return 'Источник подтверждён. Это не разрешение на рассылку: Telegram и основание для сообщения проверяются отдельно.';
    case 'source_unavailable': return 'Не удалось прочитать сайт-источник или его правила доступа. Принадлежность контакта пока неизвестна. Повторите позже; существующие результаты не удалены.';
    case 'source_changed': return 'Источник изменился или больше не публикует этот контакт. Обновите карточку компании и проверьте актуальную ссылку.';
    case 'classification_unconfirmed': return 'Ссылка есть, но сайт не обозначает её как контакт компании. Личный профиль, канал, группа и бот не допускаются. Нужен явно опубликованный корпоративный контакт.';
    case 'do_not_contact': return 'Компания отмечена «Не связываться». Подтверждение и отправка недоступны.';
    case 'company_not_found': return 'Карточка компании недоступна. Обновите аудиторию.';
    case 'no_confirmable_endpoint': case 'candidate_required': return 'Нет подходящей ссылки с официального сайта. Обновите контакты компании и выберите опубликованный источник.';
    default: return 'Подтверждение не получено. Обновите карточку для сверки; отправка не запускалась.';
  }
}
