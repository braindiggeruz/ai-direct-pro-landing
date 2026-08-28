export interface LeadRadarEnrichmentDiagnostics {
  schemaReady: boolean;
  reports: Array<{
    company_id: string;
    mode: 'shadow' | 'fallback';
    status: string;
    pages: number;
    contacts: number;
    direct_contacts: number;
    updated_at: string;
  }>;
  usage: { reserved_credits: number; uncertain_requests: number | null } | null;
}

export const FIRECRAWL_STATUS_LABELS: Record<string, string> = {
  continuation: 'Часть страниц сохранена; очередь продолжит обработку без повторной оплаты',
  enriched: 'Найден корпоративный Telegram — допуск к отправке проверяется отдельно',
  no_business_telegram: 'Сайт прочитан; корпоративный Telegram не найден',
  identity_unconfirmed: 'Принадлежность сайта компании не подтверждена',
  robots_blocked: 'Обход запрещён правилами сайта',
  robots_unavailable: 'Не удалось проверить правила обхода сайта',
  budget_or_lease_blocked: 'Лимит затрат исчерпан или задание больше не активно',
  credits_exhausted: 'Кредиты Firecrawl закончились; требуется проверка владельцем',
  authentication_failed: 'Firecrawl отклонил ключ; требуется проверка владельцем',
  rate_limited: 'Ограничение Firecrawl; отложенный ограниченный повтор',
  request_unknown: 'Результат запроса неизвестен; платный запрос автоматически не повторяется',
  result_expired: 'Сохранённый результат истёк; повторное списание не выполняется',
  target_http_error: 'Сайт вернул ошибку или запрет доступа',
  unsafe_url: 'URL не прошёл проверку безопасности',
  unsafe_redirect: 'Отклонено перенаправление на неподтверждённый адрес',
  stale_cache: 'Кэшированная страница не принята как новая проверка',
  provider_failed: 'Ошибка провайдера; повторное списание не выполняется',
  provider_unavailable: 'Обогащение недоступно; исходные данные сохранены',
  invalid_response: 'Некорректный ответ провайдера',
  invalid_page: 'Страница пуста или превышает допустимый размер',
};
