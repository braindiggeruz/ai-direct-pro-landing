// Mock provider — used by offline tests and as the safety fallback when Puter
// is unavailable. Produces a deterministic, valid JSON patch shape so the
// backend validators and UI diff renderer can be exercised without any LLM.

import type { AiProviderClient } from './types';
import type { AiPatchContext, AiSeoAction, AiSeoPatchField } from '../../../shared/ai-seo';

function pickTargets(ctx: AiPatchContext, n: number): string[] {
  const moneyFirst = [...ctx.clusterMoneyUrls];
  const peers = ctx.clusterPeers.map((p) => p.url);
  const candidates = [...new Set([...moneyFirst, ...peers])]
    .filter((u) => u !== ctx.url && !ctx.internalTargets.includes(u));
  return candidates.slice(0, n);
}

function ruOrUz(ctx: AiPatchContext, ru: string, uz: string): string {
  return ctx.locale === 'uz' ? uz : ru;
}

export function buildMockPatch(action: AiSeoAction, ctx: AiPatchContext): {
  fields: AiSeoPatchField[];
  summary: string;
} {
  const fields: AiSeoPatchField[] = [];

  if (action === 'improve_article_seo' || action === 'freshness_refresh') {
    if (ctx.title && ctx.title.length < 45) {
      fields.push({
        id: 'title',
        field: 'title',
        before: ctx.title,
        after: `${ctx.title} — ${ruOrUz(ctx, 'для бизнеса в Узбекистане', 'O‘zbekistondagi biznes uchun')}`.slice(0, 64),
        reason: ruOrUz(ctx, 'Усиливаем title локальным модификатором', 'Title’ni mahalliy modifikator bilan kuchaytirish'),
        risk: 'low',
      });
    }
    if (ctx.description && (ctx.description.length < 120 || ctx.description.length > 160)) {
      const base = ctx.description.replace(/\s+/g, ' ').trim();
      const padded = base.length < 120
        ? `${base} ${ruOrUz(ctx, 'Подключение в Ташкенте без шаблонных обещаний.', 'Toshkent uchun yo‘lga qo‘yish — shablonsiz, aniq natija bilan.')}`.slice(0, 160)
        : base.slice(0, 158).trim() + '.';
      fields.push({
        id: 'description',
        field: 'description',
        before: ctx.description,
        after: padded,
        reason: ruOrUz(ctx, 'Описание выводим в SEO-диапазон 120–160 символов', 'Meta description’ni 120–160 belgi diapazoniga keltirish'),
        risk: 'low',
      });
    }
  }

  if (action === 'fix_orphan_article' || action === 'add_internal_links') {
    const targets = pickTargets(ctx, action === 'fix_orphan_article' ? 3 : 2);
    if (targets.length) {
      const newLinks = targets.map((t) => ({
        target: t,
        anchor: ruOrUz(ctx,
          'Узнать подробнее о решении',
          'Yechim haqida batafsil ma’lumot olish',
        ),
        locale: ctx.locale,
        type: 'contextual' as const,
        reason: 'AI-suggested supporting link',
      }));
      fields.push({
        id: 'internalLinks',
        field: 'internalLinks',
        before: ctx.internalTargets,
        after: [...ctx.internalTargets, ...newLinks.map((l) => l.target)],
        reason: ruOrUz(ctx,
          'Связываем сиротскую статью с money-страницами кластера',
          'Yetim maqolani klaster money-sahifalariga bog‘lash',
        ),
        risk: 'low',
      });
    }
  }

  if (action === 'topic_cluster_backfill' && !ctx.topicCluster) {
    fields.push({
      id: 'topicCluster',
      field: 'topicCluster',
      before: ctx.topicCluster ?? null,
      after: ctx.clusterMoneyUrls[0] ? 'ai-bot-business' : 'ai-bot-business',
      reason: ruOrUz(ctx,
        'Заполняем topicCluster на основе анкорной близости',
        'topicCluster maydonini anchor yaqinligi asosida to‘ldirish',
      ),
      risk: 'low',
    });
    if (!ctx.targetMoneyPage && ctx.clusterMoneyUrls[0]) {
      fields.push({
        id: 'targetMoneyPage',
        field: 'targetMoneyPage',
        before: null,
        after: ctx.clusterMoneyUrls[0],
        reason: ruOrUz(ctx,
          'Указываем целевую money-страницу для перелинковки',
          'Bog‘lanish uchun maqsadli money-sahifani belgilash',
        ),
        risk: 'low',
      });
    }
  }

  return {
    fields,
    summary: ruOrUz(ctx,
      `Mock-патч для действия ${action}. ${fields.length} полей предложено.`,
      `${action} amali uchun mock patch. ${fields.length} maydon taklif qilindi.`,
    ),
  };
}

export const MockProvider: AiProviderClient = {
  id: 'mock',

  async isAvailable() { return true; },

  async modelHint() { return 'mock-1'; },

  async generate({ action, ctx }) {
    const { fields, summary } = buildMockPatch(action, ctx);
    const patch = {
      url: ctx.url,
      locale: ctx.locale,
      action,
      fields,
      summary,
      requiresHumanReview: fields.length === 0,
    };
    return { text: JSON.stringify(patch), model: 'mock-1' };
  },
};
