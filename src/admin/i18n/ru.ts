// Russian dictionary for the GPTBot Admin UI. Default and only locale
// for now — the i18n layer is structured so additional locales can be
// added later without touching component code.
//
// Rules:
//   * Keep product names in English: GPTBot, SEO, OpenRouter, Serper, n8n,
//     GitHub, IndexNow, Cloudflare, AI, JSON-LD.
//   * Use natural Russian, not literal calques.
//   * Status / state words are short.
//   * Error messages are friendly: lead with WHAT happened in human terms,
//     not the technical code.

export const ru = {
  // ─── Nav / Shell ────────────────────────────────────────────────────
  nav: {
    cockpit:        'SEO-пульт',
    seo_autopilot:  'SEO Автопилот',
    pages:          'Страницы',
    blog:           'Блог',
    ai_drafts:      'AI-черновики',
    internal_links: 'Внутренние ссылки',
    seo_booster:    'SEO Booster',
    redirects:      'Редиректы',
    global_seo:     'Глобальный SEO',
    publish_github: 'Опубликовать в GitHub',
    logout:         'Выйти',
    brand_label:    'SEO-пульт',
  },

  // ─── Common ─────────────────────────────────────────────────────────
  common: {
    loading:          'Загрузка…',
    refresh:          'Обновить',
    refreshing:       'Обновляем…',
    retry:            'Повторить',
    retry_section:    'Повторить загрузку',
    open:             'Открыть',
    open_details:     'Открыть подробности',
    open_settings:    'Перейти к настройкам',
    cancel:           'Отмена',
    save:             'Сохранить',
    confirm:          'Подтвердить',
    yes:              'Да',
    no:               'Нет',
    back:             'Назад',
    next:             'Далее',
    all:              'Все',
    none:             'Нет',
    empty:            'Пусто',
    none_yet:         'Пока пусто',
    last_updated:     'Обновлено',
    request_id:       'Идентификатор запроса',
    code:             'Код',
    endpoint:         'Точка',
    http_status:      'HTTP-статус',
    technical_detail: 'Технические подробности',
    show_more:        'Показать ещё',
    show_less:        'Свернуть',
    elapsed:          'прошло',
    expected_effect:  'Ожидаемый эффект',
    in_history:       'в истории',
    last_24h:         'за 24 часа',
    active:           'Активно',
    historical:       'Историческое',
  },

  // ─── Cockpit ────────────────────────────────────────────────────────
  cockpit: {
    section_label:    'SEO Mission Control',
    title:            'SEO-пульт',
    subtitle:         'Живое состояние страниц, блога, AI Draft Inbox и SEO Автопилота. Черновики не публикуются автоматически — только вручную через GitHub.',

    nba_title:        'Приоритетные действия',
    nba_empty:        'Срочных задач нет. Все проверки пройдены, входящие черновики обработаны. Можно запустить SEO Автопилот для нового черновика.',
    nba_all_clean:    'Срочных задач нет — админка в порядке.',
    nba_action_default:'Перейти',

    kpi: {
      published_pages: 'Опубликовано страниц',
      published_blog:  'Опубликовано в блоге',
      in_sitemap:      'В sitemap',
      orphan:          'Страницы-сироты',
      broken_links:    'Битые ссылки',
      mojibake:        'Кодировка (mojibake)',
      pending_drafts:  'Черновики на проверке',
      needs_revision:  'Требуют доработки',
      autopilot_inflight: 'Автопилот выполняется',
      autopilot_active_failed: 'Активные ошибки Автопилота',
      audit_failed:    'Аудит',
      drafts_failed:   'Черновики',
      autopilot_failed_section: 'Автопилот',
      n_failed_to_load:'не загрузилось',
    },

    health: {
      title:           'Состояние системы',
      probed:          'проверено',
      sitemap_xml:     'Sitemap отдаёт XML',
      robots_txt:      'Robots.txt отвечает',
      random_404:      'Проверка страницы 404 — успешно',
      admin_noindex:   'Админка закрыта от индексации',
      favicon:         'Favicon доступен',
      sample_image:    'Картинки блога доступны',
      titles:          'Заполнены title-теги',
      descriptions:    'Заполнены meta-описания',
      titles_unique:   'Уникальные title-теги',
      ru_uz_pairs:     'Пары RU↔UZ',
      jsonld:          'JSON-LD-разметка',
      faq:             'Блоки FAQ',
      missing_n:       '{n} не заполнено',
      duplicates_n:    '{n} дублей',
      integrations:    'Интеграции',
      github_label:    'GitHub',
      jwt_label:       'JWT-секрет',
      d1_label:        'D1 (черновики)',
      n8n_label:       'n8n webhook',
      openrouter_label:'OpenRouter',
      serper_label:    'Serper',
      gemini_label:    'Gemini (опц.)',
      level_healthy:   'Работает',
      level_limited:   'Ограниченная работа',
      level_failed:    'Ошибка',
      level_unconfigured:'Не настроено',
      level_unknown:   'Неизвестно',
      github_owner_repo:'Репозиторий',
      github_branch:   'Ветка',
      github_sample:   'Тест-чтение',
    },

    drafts_panel: {
      title:           'AI Draft Inbox',
      pending:         'На проверке',
      needs_revision:  'Требуют доработки',
      imported:        'Импортировано',
      rejected:        'Отклонено',
      latest_pending:  'Последний черновик',
      open_inbox:      'Открыть Inbox',
      open_draft:      'Открыть последний черновик',
      run_autopilot:   'Запустить SEO Автопилот',
      empty:           'Inbox пуст. Запустите SEO Автопилот, чтобы получить новый черновик.',
    },

    autopilot_panel: {
      title:           'SEO Автопилот',
      in_flight:       'Выполняется',
      completed:       'Завершено',
      active_failed:   'Активные ошибки',
      historical_failed:'Историческое',
      last_success:    'Последний успешный запуск',
      last_failed:     'Последний запуск с ошибкой',
      no_active_failures:'Активных ошибок нет',
      last_24h:        'за последние 24 часа',
      schedule:        'Расписание',
      schedule_disabled:'отключено',
      schedule_weekly:  'еженедельно',
      schedule_twice:   'дважды в неделю',
      stale_swept:     'автоматически восстановлено {n} зависших',
      open:            'Открыть',
    },

    pages_table: {
      title:           'Все страницы',
      manage:          'Управлять',
      url:             'URL',
      type:            'Тип',
      status:          'Статус',
      score:           'SEO-оценка',
      issues:          'Замечания',
      showing_of:      'Показано {n} из {total}. ',
      empty:           'Страниц пока нет.',
    },

    status: {
      published:       'опубликовано',
      draft:           'черновик',
      noindex:         'noindex',
      pending:         'ожидает',
      forwarding:      'отправляется в n8n',
      normalising:     'обработка ответа',
      ingesting:       'сохраняется',
      completed:       'готово',
      failed:          'ошибка',
    },

    risk: {
      low:    'низкий',
      medium: 'средний',
      high:   'высокий',
      critical:'критично',
    },

    error: {
      // Friendly title shown when the WHOLE /api/admin/cockpit call fails.
      fatal_title:      'Не удалось загрузить SEO-пульт',
      fatal_default:    'Сервис временно недоступен. Повторите запрос или откройте технические подробности.',
      // Per-section friendly titles.
      section_audit:    'Не удалось загрузить SEO-аудит',
      section_content:  'Не удалось получить контент из GitHub',
      section_drafts:   'Не удалось загрузить AI-черновики',
      section_autopilot:'Не удалось загрузить статистику Автопилота',
      section_health:   'Не удалось проверить состояние сервисов',
      // Code-specific user-facing copy.
      gh_auth_failed:   'GitHub отклонил токен доступа. Обновите GITHUB_TOKEN в Cloudflare Pages → Settings → Environment.',
      gh_rate_limited:  'GitHub временно ограничил доступ (rate limit). Повторите через минуту.',
      gh_unavailable:   'GitHub временно не вернул данные сайта. Повторите запрос или откройте технические подробности.',
      d1_unavailable:   'База D1 недоступна. Проверьте binding GPTBOT_DRAFTS_DB.',
      d1_query_failed:  'Запрос к D1 завершился ошибкой.',
      integration_timeout:'Внешний сервис ответил слишком долго.',
      integration_unavailable:'Внешний сервис временно недоступен.',
      internal:         'Внутренняя ошибка сервиса.',
      cockpit_partial:  'Часть данных недоступна, остальные секции работают.',
    },
  },

  // ─── SEO Autopilot Control Center ──────────────────────────────────
  autopilot: {
    title:              'SEO Автопилот',
    subtitle:           'Запускает существующий n8n-движок генерации и сохраняет RU/UZ пакет в AI Draft Inbox. Черновики остаются не опубликованными до ручного Publish to GitHub в Blog Editor.',
    manual_run:         'Ручной запуск',
    manual_run_hint:    'Браузер никогда не получает n8n-секрет — сервер вызывает n8n с N8N_WEBHOOK_SECRET из Cloudflare. Генерация занимает 1–4 минуты; страница держит соединение открытым, пока черновик не готов.',
    run:                'Запустить SEO Автопилот',
    open_draft:         'Открыть новый черновик',
    open_last_draft:    'Открыть последний черновик',
    open_inbox:         'Открыть AI Draft Inbox',
    schedule:           'Расписание',
    schedule_hint:      'Запускается через GitHub Actions cron (UTC). Только черновики.',
    schedule_disabled:  'Отключено',
    schedule_weekly:    'Раз в неделю (понедельник 09:00 UTC)',
    schedule_twice:     'Дважды в неделю (понедельник + четверг 09:00 UTC)',
    current:            'Сейчас',
    updated_by:         'обновил',
    recent_runs:        'Недавние запуски',
    stale_swept:        '{n} зависших задач автоматически восстановлены.',
    no_runs:            'Запусков пока нет. Нажмите «Запустить SEO Автопилот» наверху.',
    progress_request:   'Отправляем запрос в n8n…',
    progress_serp:      'Собираем SERP и sitemap (~30 секунд)…',
    progress_ru:        'OpenRouter генерирует RU-статью…',
    progress_uz:        'OpenRouter генерирует UZ-адаптацию…',
    progress_validate:  'Финальная валидация…',
    progress_long:      'Дольше обычного — подождите ещё пару минут…',
    keep_page:          'Не закрывайте страницу — закрытие не остановит n8n, но черновик появится в Inbox в фоне.',
    no_publish:         'Без GitHub publish, без IndexNow, без публикации — только черновик.',
    table: {
      status:       'Статус',
      source:       'Источник',
      started:      'Начато',
      duration:     'Длительность',
      n8n:          'n8n',
      validation:   'Валидация',
      draft_error:  'Черновик / ошибка',
      passed:       'пройдена',
    },
    source: {
      admin:        'Ручной запуск',
      schedule:     'По расписанию',
      external:     'Внешний (устарел)',
    },
    n8n_secret_missing:'N8N_WEBHOOK_SECRET не настроен. Установите его в Cloudflare Pages → Settings → Environment variables.',
    cron_secret_missing:'CRON_SECRET не настроен — запуски по расписанию будут отклонены.',
    drafts_db_missing:'D1 binding GPTBOT_DRAFTS_DB отсутствует.',
    config_required:  'Требуется настройка',
  },

  // ─── Next Best Actions ──────────────────────────────────────────────
  nba: {
    section_failed_title:  'Секция «{section}» SEO-пульта не загрузилась',
    section_failed_reason: 'Загрузчик секции {section} вернул ошибку при последнем обновлении.',
    section_failed_effect: 'Часть KPI и очередей будет пустой, пока внешний сервис не восстановится.',
    section_failed_action: 'Повторить загрузку',

    n8n_secret_title:      'Не настроен N8N_WEBHOOK_SECRET',
    n8n_secret_reason:     'SEO Автопилот не может вызвать n8n без общего webhook-секрета.',
    n8n_secret_effect:     'Новые AI-черновики не будут генерироваться, пока секрет не задан.',
    n8n_secret_action:     'Открыть SEO Автопилот',

    autopilot_failed_title:  'Последний запуск SEO Автопилота — ошибка ({code})',
    autopilot_failed_reason: 'Подробности в карточке задания (n8n excerpt, validation issues).',
    autopilot_failed_effect: 'Повторите запуск, чтобы получить свежий RU+UZ-пакет. Существующие черновики не затрагиваются.',
    autopilot_failed_action: 'Открыть Автопилот',

    drafts_pending_title:  '{n} AI-черновик{pluralEnding} ожидает вашей проверки',
    drafts_pending_reason: 'Последний: «{title}». RU + UZ пакеты не публикуются до вашего одобрения.',
    drafts_pending_reason_no_title:'RU + UZ пакеты не публикуются до вашего одобрения.',
    drafts_pending_effect: 'Каждый одобренный черновик добавит одну индексируемую статью (+1 URL в sitemap, +1 цель для внутренних ссылок).',
    drafts_pending_action_open_draft:'Открыть последний черновик',
    drafts_pending_action_open_inbox:'Открыть Inbox',

    drafts_revision_title:  '{n} черновик{pluralEnding} помечен «требует доработки»',
    drafts_revision_reason: 'Вы пометили их для изменений. Доработка или повторный запуск освобождает Inbox.',
    drafts_revision_effect: 'Разбор очереди освободит Inbox для новых запусков Автопилота.',

    mojibake_title:  'На {n} страниц{pluralEnding} обнаружены искажения кодировки',
    mojibake_reason: 'Страницы с битой кодировкой выглядят как мусор для пользователей и поисковиков; публикация заблокирована.',
    mojibake_effect: 'После исправления страницы снова дадут ранжирующие сигналы.',

    broken_links_title:  'На сайте {n} битых внутренних ссыл{pluralEnding}',
    broken_links_reason: 'Ссылки на несуществующие страницы тратят crawl-бюджет и сбивают Google.',
    broken_links_effect: 'Исправление каждой ссылки возвращает ~1–2% crawl-бюджета и укрепляет тематические кластеры.',
    broken_links_action: 'Открыть «Внутренние ссылки»',

    duplicate_title_title:'{n} дублирующих <title>',
    duplicate_title_reason:'Дубли title запускают перезапись Google и каннибализацию между страницами.',
    duplicate_title_effect:'Уникальные title уточняют, какая страница ранжируется по какому интенту.',

    duplicate_desc_title:'{n} дублирующих meta description',
    duplicate_desc_reason:'Дубли описаний снижают CTR; Google часто заменяет их случайными фрагментами.',
    duplicate_desc_effect:'Уникальные описания могут поднять CTR на 5–15% по каннибал-запросам.',

    orphan_title:  '{n} страниц{pluralEnding} без входящих ссылок',
    orphan_reason: 'Страницы без внутренних ссылок плохо ранжируются и могут выпасть из индекса.',
    orphan_effect: 'Каждая ссылка с сильной страницы передаёт PageRank и улучшает позиции.',
    orphan_action: 'Открыть «Внутренние ссылки»',

    faq_title:  '{n} страниц{pluralEnding} без блока FAQ',
    faq_reason: 'FAQ-блоки открывают rich-результаты и дают внутренние якоря для long-tail.',
    faq_effect: 'Money-страница с 4+ FAQ обычно ранжируется по 10–30 дополнительным long-tail запросам.',

    missing_fields_title:  '{n} незаполненных SEO-полей (title/description/H1)',
    missing_fields_reason: 'Без этих полей страницы не могут ранжироваться ни по одному запросу.',
    missing_fields_effect: 'После заполнения страницы сразу получают право на индексацию.',

    missing_canonical_title:'{n} страниц{pluralEnding} без canonical',
    missing_canonical_reason:'Без canonical Google выбирает URL сам — часто неправильный.',
    missing_canonical_effect:'Один canonical = на одну неожиданность ранжирования меньше.',

    hreflang_title:  '{n} пар RU↔UZ не комплектные',
    hreflang_reason: 'Без пары hreflang сломан, и один из языков теряет трафик.',
    hreflang_effect: 'Восстановление пары даёт слабому языку +10–20% за месяц.',

    sitemap_mismatch_title:  '{n} опубликованных страниц{pluralEnding} не попадает в sitemap',
    sitemap_mismatch_reason: 'Published, но robotsIndex=false → не в sitemap.xml → Google может не сканировать.',
    sitemap_mismatch_effect: 'Возврат в sitemap = возврат в очередь индексации.',

    sitemap_down_title:'sitemap.xml не отдаёт 200 + XML',
    sitemap_down_reason:'Google использует sitemap.xml для обнаружения новых URL.',
    sitemap_down_effect:'Восстановление ускоряет индексацию новых черновиков.',

    robots_down_title:'robots.txt не отвечает 200',
    robots_down_reason:'Без robots.txt директивы сканирования неоднозначны.',
    robots_down_effect:'Восстановление делает поведение индексации предсказуемым.',

    soft404_title:'Неизвестный URL не возвращает 404',
    soft404_reason:'Soft-404 тратят crawl-бюджет и сбивают Google.',
    soft404_effect:'Исправление улучшает эффективность сканирования по всему сайту.',
    soft404_action:'Открыть «Редиректы»',

    admin_indexable_title:'Раздел /admin-tools/ не закрыт от индексации',
    admin_indexable_reason:'Админка никогда не должна попадать в индекс.',
    admin_indexable_effect:'Защита приватности и crawl-бюджета.',
  },

  // ─── ErrorBoundary ─────────────────────────────────────────────────
  boundary: {
    title:       'Что-то сломалось в админке',
    description: 'SPA поймал необработанное исключение. Остальная часть сайта продолжает работать — пострадал только этот экран.',
    detail:      'технические подробности',
    try_again:   'Попробовать снова',
    back_home:   'К SEO-пульту',
  },

  // ─── AI Optimize modal ─────────────────────────────────────────────
  aiOptimize: {
    button:            'Оптимизировать с AI',
    buttonRunning:     'Оптимизируем…',
    modalTitle:        'AI-оптимизация статьи',
    modelLabel:        'Модель',
    changesHeading:    'Что улучшил AI',
    noChanges:         'AI не выделил конкретных правок — сравните вручную.',
    keptHeading:       'Сохранено без изменений',
    validationBefore:  'Валидация: до',
    validationAfter:   'Валидация: после',
    warningsHeading:   'Предупреждения',
    fieldDiffHeading:  'Сравнение по полям',
    bodyDiffHeading:   'Блоки тела статьи изменены — сравните слева/справа.',
    bodyBlocksBefore:  'Блоки: было',
    bodyBlocksAfter:   'Блоки: стало',
    faqDiffHeading:    'FAQ обновлён — сравните вопросы и ответы.',
    linksDiffHeading:  'Внутренние ссылки обновлены.',
    before:            'Было',
    after:             'Стало',
    apply:             'Применить улучшения',
    applying:          'Применяем…',
    cancel:            'Отмена',
    retry:             'Повторить оптимизацию',
    applySuccess:      'Улучшенная версия сохранена. Статус остаётся «на проверке».',
    applyFailed:       'Не удалось применить улучшения',
    loadFailed:        'Не удалось получить ответ от OpenRouter',
    noLocale:          'У черновика нет статьи на выбранной локали.',
    lockedStatus:      'Оптимизация недоступна: черновик отклонён или уже импортирован.',
  },
} as const;

// Helper: pluralize Russian-style with simple substitutions used in nba strings.
// 1 → '', 2..4 → 'а', 5..0 → 'ов' (matches usage in dictionary).
export function pluralRu(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'ов';
  if (mod10 === 1) return '';
  if (mod10 >= 2 && mod10 <= 4) return 'а';
  return 'ов';
}

// Minimal template substitution: replaces "{key}" with the provided value.
export function tpl(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}
