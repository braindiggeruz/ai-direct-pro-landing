const MESSAGES: Record<string, string> = {
  telegram_campaign_schema_unavailable: 'Структура базы кампаний не прошла проверку. Требуется восстановить серверную схему, перепривязка Telegram не поможет.',
  telegram_campaign_not_configured: 'Не прошла проверка ключа кампаний или серверного интервала отправки. Аккаунт не отключайте.',
  telegram_campaign_gateway_not_configured: 'Шлюз Telegram не настроен. Требуется проверить серверные ключи и привязки сервисов.',
  telegram_campaign_gateway_unavailable: 'Сайт не получил ответ от шлюза Telegram. Проверьте готовность системы; повторная привязка не требуется.',
  telegram_campaign_bridge_offline: 'Локальный Bridge не отвечает. Запустите программу на компьютере; файл и выбор сохранены.',
  telegram_campaign_media_check_pending: 'Bridge ещё проверяет изображение. Дождитесь результата в блоке изображения и повторите проверку кампании.',
  telegram_campaign_media_validation_failed: 'Bridge не подтвердил результат проверки изображения. Отправка закрыта; нужно проверить состояние операции.',
  telegram_campaign_media_not_found: 'Защищённая копия изображения отсутствует или истекла. Выберите и загрузите файл заново.',
  telegram_campaign_media_storage_unavailable: 'Не отвечает защищённое хранилище изображения. Это не ошибка входа в Telegram.',
  telegram_campaign_gateway_not_found: 'Шлюз не нашёл запрошенный объект аккаунта. Сначала обновите статус; не запускайте повторную отправку.',
  audience_schema_unavailable: 'Схема сохранённых аудиторий недоступна. Выбор сохранён, но запуск пока закрыт.',
};

/** Only allowlisted diagnostic tokens reach the UI. Never echo raw server messages. */
export function describeCampaignFailure(error: unknown, fallback: string): string {
  const details = (error ?? {}) as { code?: unknown; requestId?: unknown; status?: unknown; name?: unknown };
  const code = typeof details.code === 'string' && /^[A-Za-z][A-Za-z0-9_]{1,100}$/u.test(details.code) ? details.code : null;
  const requestId = typeof details.requestId === 'string' && /^[A-Za-z0-9:_-]{1,160}$/u.test(details.requestId) ? details.requestId : null;
  const message = details.name === 'AbortError'
    ? 'Ожидание ответа закончилось. Операция могла завершиться на сервере; сначала обновите её состояние.'
    : (code && MESSAGES[code]) || fallback;
  const diagnostic = [code ? `Код: ${code}.` : null,
    typeof details.status === 'number' && details.status >= 400 && details.status <= 599 ? `HTTP ${details.status}.` : null,
    requestId ? `Запрос: ${requestId}.` : null].filter(Boolean).join(' ');
  return diagnostic ? `${message} ${diagnostic}` : message;
}
