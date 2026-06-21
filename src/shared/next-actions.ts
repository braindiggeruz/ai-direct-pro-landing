// Next Best Actions engine — central recommendation system for the
// GPTBot Admin SEO Mission Control.
//
// Goal: turn raw audit + draft + autopilot signals into a *ranked* list
// of operator actions, each carrying:
//   - clear Russian title (what to do)
//   - reason (why it matters)
//   - affected entity (URL, draft id, job id)
//   - expected SEO/business effect (qualitative)
//   - risk level (low/medium/high/critical)
//   - one action button (deep link into the right editor / queue)
//
// Priority is computed deterministically from a small impact weight per
// rule, so the cockpit shows the same top-3 across refreshes (which is
// what the operator expects). Nothing here mutates state — the action
// buttons in the UI navigate to the relevant page; the operator decides
// to act.

import type { CockpitStats, Page, BlogArticle } from './types';

export type ActionRisk = 'low' | 'medium' | 'high' | 'critical';

export interface NextBestAction {
  id: string;
  title: string;
  reason: string;
  effect: string;
  risk: ActionRisk;
  weight: number;
  action_label: string;
  action_path: string;
  affected_url?: string;
  affected_draft?: string;
  affected_job?: string;
  category: 'autopilot' | 'drafts' | 'content' | 'links' | 'index' | 'health' | 'config';
}

interface BuildInput {
  audit: (CockpitStats & {
    publishedBlog?: number; blogMissingFaq?: number; blogMissingTitle?: number; blogMissingDescription?: number; blogDuplicateTitle?: number;
  }) | null;
  content: { pages: Page[]; blog: BlogArticle[] } | null;
  drafts: { pending_review: number; needs_revision: number; last_pending_id: string | null; last_pending_admin_url: string | null; last_pending_title: string | null } | null;
  autopilot: { active_failed: number; failed_24h: number; failed_total: number; in_flight: number; stale_swept: number; last_failed: { id: string; error_code: string | null; error_message: string | null; created_at?: string } | null; n8n_webhook_secret_configured: boolean; schedule_mode: string } | null;
  health: {
    sitemap200Xml?: boolean; randomUrl404?: boolean; adminNoindex?: boolean;
    robots200?: boolean; faviconLive?: boolean; sampleImageLive?: boolean;
  } | null;
  sectionsFailed: string[];
}

function action(a: Omit<NextBestAction, 'id'>, id: string): NextBestAction {
  return { id, ...a };
}

// Russian plural helper: 1 → '', 2..4 → 'а', 5..0 → 'ов'.
function plural(n: number): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'ов';
  if (mod10 === 1) return '';
  if (mod10 >= 2 && mod10 <= 4) return 'а';
  return 'ов';
}

// Translate a failed-section identifier to Russian label.
function sectionLabel(s: string): string {
  switch (s) {
    case 'audit':     return 'SEO-аудит';
    case 'content':   return 'контент из GitHub';
    case 'drafts':    return 'AI-черновики';
    case 'autopilot': return 'статистика Автопилота';
    case 'health':    return 'состояние сервисов';
    default: return s;
  }
}

export function buildNextBestActions(input: BuildInput): NextBestAction[] {
  const out: NextBestAction[] = [];

  // 1. Section failures — Critical: without these, the cockpit can't do its job.
  for (const sec of input.sectionsFailed) {
    const isCore = sec === 'audit' || sec === 'content';
    out.push(action({
      title: `Не загрузилась секция «${sectionLabel(sec)}»`,
      reason: `Загрузчик секции вернул ошибку при последнем обновлении. Большая часть KPI зависит от этих данных.`,
      effect: isCore
        ? 'Без этой секции SEO-пульт не может показать список страниц, рекомендации и приоритеты.'
        : 'Часть KPI и очередей будет пустой, пока внешний сервис не восстановится.',
      risk: isCore ? 'critical' : 'high',
      weight: isCore ? 990 : 880,
      action_label: 'Повторить загрузку',
      action_path: '/admin-tools',
      category: 'health',
    }, `section-failed-${sec}`));
  }

  // 2. Autopilot config issues — Critical: blocks new content end-to-end.
  if (input.autopilot && !input.autopilot.n8n_webhook_secret_configured) {
    out.push(action({
      title: 'Не настроен N8N_WEBHOOK_SECRET',
      reason: 'SEO Автопилот не может вызвать n8n без общего webhook-секрета.',
      effect: 'Новые AI-черновики не будут генерироваться, пока секрет не задан.',
      risk: 'critical',
      weight: 960,
      action_label: 'Открыть SEO Автопилот',
      action_path: '/admin-tools/seo-autopilot',
      category: 'config',
    }, 'config-n8n-secret'));
  }

  // 3. Active autopilot failure (within last 24h with latest run failed).
  //    Older historical failures don't show up here — they live in the
  //    Autopilot panel only.
  if (input.autopilot?.active_failed && input.autopilot.last_failed) {
    const f = input.autopilot.last_failed;
    out.push(action({
      title: `Последний запуск SEO Автопилота завершился ошибкой (${f.error_code || 'error'})`,
      reason: f.error_message ? f.error_message.slice(0, 200) : 'Подробности в карточке задания (n8n excerpt, validation issues).',
      effect: 'Повторите запуск, чтобы получить свежий RU + UZ пакет. Существующие черновики не затрагиваются.',
      risk: 'high',
      weight: 870,
      action_label: 'Открыть Автопилот',
      action_path: '/admin-tools/seo-autopilot',
      affected_job: f.id,
      category: 'autopilot',
    }, `autopilot-active-failed`));
  }

  // 4. Pending AI drafts — high-value operator queue.
  if (input.drafts && input.drafts.pending_review > 0) {
    const n = input.drafts.pending_review;
    out.push(action({
      title: `${n} AI-черновик${plural(n)} ожидает вашей проверки`,
      reason: input.drafts.last_pending_title
        ? `Последний: «${input.drafts.last_pending_title}». RU + UZ пакеты не публикуются до вашего одобрения.`
        : 'RU + UZ пакеты не публикуются до вашего одобрения.',
      effect: 'Каждый одобренный черновик добавит индексируемую статью (+1 URL в sitemap, +1 цель для внутренних ссылок).',
      risk: 'medium',
      weight: 820,
      action_label: input.drafts.last_pending_admin_url ? 'Открыть последний черновик' : 'Открыть Inbox',
      action_path: input.drafts.last_pending_admin_url || '/admin-tools/ai-drafts',
      affected_draft: input.drafts.last_pending_id || undefined,
      category: 'drafts',
    }, `drafts-pending-${input.drafts.last_pending_id || 'any'}`));
  }
  if (input.drafts && input.drafts.needs_revision > 0) {
    const n = input.drafts.needs_revision;
    out.push(action({
      title: `${n} черновик${plural(n)} помечен «требует доработки»`,
      reason: 'Вы отметили их для изменений. Доработка или повторный запуск освобождает Inbox для новых задач.',
      effect: 'Разбор очереди освободит Inbox для новых запусков Автопилота.',
      risk: 'low',
      weight: 680,
      action_label: 'Открыть Inbox',
      action_path: '/admin-tools/ai-drafts',
      category: 'drafts',
    }, 'drafts-needs-revision'));
  }

  // 5. Audit-driven content actions.
  if (input.audit) {
    const a = input.audit;

    if ((a.mojibakePages ?? 0) > 0) {
      const n = a.mojibakePages!;
      out.push(action({
        title: `На ${n} страниц${plural(n)} обнаружены искажения кодировки`,
        reason: 'Страницы с битой кодировкой выглядят как мусор для пользователей и поисковиков; публикация заблокирована.',
        effect: 'После исправления страницы снова дадут ранжирующие сигналы.',
        risk: 'high',
        weight: 940,
        action_label: 'Открыть «Страницы»',
        action_path: '/admin-tools/pages',
        category: 'content',
      }, 'audit-mojibake'));
    }

    if ((a.brokenInternalLinks ?? 0) > 0) {
      const n = a.brokenInternalLinks;
      out.push(action({
        title: `На сайте ${n} битых внутренних ссыл${plural(n)}`,
        reason: 'Ссылки на несуществующие страницы тратят crawl-бюджет и сбивают Google.',
        effect: 'Исправление каждой ссылки возвращает ~1–2% crawl-бюджета и укрепляет тематические кластеры.',
        risk: 'medium',
        weight: 800,
        action_label: 'Открыть «Внутренние ссылки»',
        action_path: '/admin-tools/internal-links',
        category: 'links',
      }, 'audit-broken-links'));
    }

    if ((a.duplicateTitle ?? 0) > 0) {
      const n = a.duplicateTitle;
      out.push(action({
        title: `${n} дублирующих <title>`,
        reason: 'Дубли title запускают перезапись от Google и каннибализацию между страницами.',
        effect: 'Уникальные title уточняют, какая страница ранжируется по какому интенту.',
        risk: 'medium',
        weight: 740,
        action_label: 'Открыть «Страницы»',
        action_path: '/admin-tools/pages',
        category: 'content',
      }, 'audit-duplicate-title'));
    }

    if ((a.duplicateDescription ?? 0) > 0) {
      const n = a.duplicateDescription;
      out.push(action({
        title: `${n} дублирующих meta description`,
        reason: 'Дубли описаний снижают CTR; Google часто заменяет их случайными фрагментами текста.',
        effect: 'Уникальные описания могут поднять CTR на 5–15% по каннибал-запросам.',
        risk: 'medium',
        weight: 700,
        action_label: 'Открыть «Страницы»',
        action_path: '/admin-tools/pages',
        category: 'content',
      }, 'audit-duplicate-description'));
    }

    if ((a.orphanPages ?? 0) > 0) {
      const n = a.orphanPages;
      out.push(action({
        title: `${n} страниц${plural(n)} без входящих ссылок`,
        reason: 'Страницы без внутренних ссылок плохо ранжируются и могут выпасть из индекса.',
        effect: 'Каждая ссылка с сильной страницы передаёт PageRank и улучшает позиции.',
        risk: 'medium',
        weight: 780,
        action_label: 'Открыть «Внутренние ссылки»',
        action_path: '/admin-tools/internal-links',
        category: 'links',
      }, 'audit-orphans'));
    }

    if ((a.missingFaq ?? 0) > 0) {
      const n = a.missingFaq;
      out.push(action({
        title: `${n} страниц${plural(n)} без блока FAQ`,
        reason: 'FAQ-блоки открывают rich-результаты (FAQPage) и дают внутренние якоря для long-tail.',
        effect: 'Money-страница с 4+ FAQ обычно ранжируется по 10–30 дополнительным long-tail запросам.',
        risk: 'medium',
        weight: 760,
        action_label: 'Открыть «Страницы»',
        action_path: '/admin-tools/pages',
        category: 'content',
      }, 'audit-missing-faq'));
    }

    if ((a.missingTitle ?? 0) > 0 || (a.missingDescription ?? 0) > 0 || (a.missingH1 ?? 0) > 0) {
      const total = (a.missingTitle ?? 0) + (a.missingDescription ?? 0) + (a.missingH1 ?? 0);
      out.push(action({
        title: `${total} незаполненных SEO-полей (title/description/H1)`,
        reason: 'Без этих полей страницы не могут ранжироваться ни по одному запросу.',
        effect: 'После заполнения страницы сразу получают право на индексацию.',
        risk: 'high',
        weight: 850,
        action_label: 'Открыть «Страницы»',
        action_path: '/admin-tools/pages',
        category: 'content',
      }, 'audit-missing-fields'));
    }

    if ((a.missingCanonical ?? 0) > 0) {
      const n = a.missingCanonical;
      out.push(action({
        title: `${n} страниц${plural(n)} без canonical`,
        reason: 'Без canonical Google выбирает URL сам — часто неправильный.',
        effect: 'Один canonical = на одну неожиданность ранжирования меньше.',
        risk: 'low',
        weight: 620,
        action_label: 'Открыть «Страницы»',
        action_path: '/admin-tools/pages',
        category: 'content',
      }, 'audit-missing-canonical'));
    }

    if ((a.ruUzPairsMissing ?? 0) > 0) {
      const n = a.ruUzPairsMissing;
      out.push(action({
        title: `${n} пар${plural(n)} RU↔UZ не комплектны`,
        reason: 'Без пары hreflang сломан, и один из языков теряет трафик.',
        effect: 'Восстановление пары даёт слабому языку +10–20% за месяц.',
        risk: 'medium',
        weight: 660,
        action_label: 'Открыть «Страницы»',
        action_path: '/admin-tools/pages',
        category: 'content',
      }, 'audit-hreflang-pairs'));
    }

    if ((a.publishedPages ?? 0) > 0 && (a.pagesInSitemap ?? 0) < a.publishedPages) {
      const n = a.publishedPages - a.pagesInSitemap;
      out.push(action({
        title: `${n} опубликованных страниц${plural(n)} не попадает в sitemap`,
        reason: 'Published, но robotsIndex=false → не в sitemap.xml → Google может не сканировать.',
        effect: 'Возврат в sitemap = возврат в очередь индексации.',
        risk: 'high',
        weight: 830,
        action_label: 'Открыть «Страницы»',
        action_path: '/admin-tools/pages',
        category: 'index',
      }, 'audit-sitemap-mismatch'));
    }
  }

  // 6. Live site health.
  if (input.health) {
    if (input.health.sitemap200Xml === false) {
      out.push(action({
        title: 'sitemap.xml не отдаёт 200 + XML',
        reason: 'Google использует sitemap.xml для обнаружения новых URL.',
        effect: 'Восстановление ускоряет индексацию новых черновиков.',
        risk: 'high',
        weight: 920,
        action_label: 'Открыть «Глобальный SEO»',
        action_path: '/admin-tools/settings',
        category: 'index',
      }, 'health-sitemap'));
    }
    if (input.health.robots200 === false) {
      out.push(action({
        title: 'robots.txt не отвечает 200',
        reason: 'Без robots.txt директивы сканирования неоднозначны.',
        effect: 'Восстановление делает поведение индексации предсказуемым.',
        risk: 'high',
        weight: 860,
        action_label: 'Открыть «Глобальный SEO»',
        action_path: '/admin-tools/settings',
        category: 'index',
      }, 'health-robots'));
    }
    if (input.health.randomUrl404 === false) {
      out.push(action({
        title: 'Неизвестный URL не возвращает 404',
        reason: 'Soft-404 тратят crawl-бюджет и сбивают Google.',
        effect: 'Исправление улучшает эффективность сканирования по всему сайту.',
        risk: 'medium',
        weight: 720,
        action_label: 'Открыть «Редиректы»',
        action_path: '/admin-tools/redirects',
        category: 'health',
      }, 'health-soft-404'));
    }
    if (input.health.adminNoindex === false) {
      out.push(action({
        title: 'Раздел /admin-tools/ не закрыт от индексации',
        reason: 'Админка никогда не должна попадать в индекс.',
        effect: 'Защита приватности и crawl-бюджета.',
        risk: 'low',
        weight: 580,
        action_label: 'Открыть «Глобальный SEO»',
        action_path: '/admin-tools/settings',
        category: 'health',
      }, 'health-admin-noindex'));
    }
  }

  // Sort by weight descending and cap at 7.
  out.sort((a, b) => b.weight - a.weight);
  return out.slice(0, 7);
}
