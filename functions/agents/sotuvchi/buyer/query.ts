import type { OrgContext } from '../../../platform/contracts';
import {
  CatalogNotFoundError,
  normalizedProductName,
  type BuyerCatalogCategory,
  type CatalogSearchResult,
  type SotuvchiCatalogService,
  type StorefrontContext,
} from '../catalog';
import { BuyerSessionError } from './errors';
import type { BuyerIntent } from './intents';

// Three cards keep the first useful result set broad enough to compare while
// avoiding a fourth sequential Telegram API round trip. Further products stay
// available through the existing deterministic pagination actions.
const PAGE_SIZE = 3;

export interface BuyerQueryResult {
  intent: BuyerIntent;
  results: readonly CatalogSearchResult[];
  hasMore: boolean;
  nextOffset: number;
  fullCard: boolean;
  state:
    | 'ok'
    | 'not_found'
    | 'missing_previous'
    | 'categories'
    | 'budget_prompt'
    | 'budget_confirmation'
    | 'comparison_waiting'
    | 'comparison_ready'
    | 'comparison_duplicate'
    | 'comparison_full'
    | 'comparison_empty'
    | 'comparison_cleared';
  maxPriceMinor?: number;
  categories?: readonly BuyerCatalogCategory[];
  categoryId?: string;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export class SotuvchiBuyerQueryService {
  constructor(
    private readonly catalog: SotuvchiCatalogService,
    private readonly botUsername: string,
  ) {}

  private async trustedContext(org: OrgContext): Promise<{
    identityId: string;
    context: StorefrontContext;
  }> {
    if (!org.actorId) throw new BuyerSessionError();
    const stored = await this.catalog.resolveStoredStorefrontContext(
      this.botUsername,
      org.actorId,
    );
    if (!stored || stored.orgId !== org.orgId) {
      throw new BuyerSessionError();
    }
    return {
      identityId: org.actorId,
      context: { ...stored, locale: org.locale },
    };
  }

  private async remember(
    org: OrgContext,
    identityId: string,
    context: StorefrontContext,
    intent: BuyerIntent,
    productId: string,
  ): Promise<void> {
    await this.catalog.recordStorefrontSelection({
      botUsername: this.botUsername,
      identityId,
      context,
      productId,
      intent,
      requestId: org.requestId,
    });
  }

  private async clearPendingBudget(
    identityId: string,
    context: StorefrontContext,
  ): Promise<void> {
    await this.catalog.clearStorefrontPendingBudget({
      botUsername: this.botUsername,
      identityId,
      context,
    });
  }

  private async present(
    org: OrgContext,
    identityId: string,
    context: StorefrontContext,
    result: BuyerQueryResult,
  ): Promise<BuyerQueryResult> {
    if (result.results.length > 0) {
      await this.catalog.recordStorefrontPresentation({
        botUsername: this.botUsername,
        identityId,
        context,
        requestId: org.requestId,
        results: result.results,
      });
    }
    return result;
  }

  async list(
    org: OrgContext,
    offset: number,
  ): Promise<BuyerQueryResult> {
    const { identityId, context } = await this.trustedContext(org);
    await this.clearPendingBudget(identityId, context);
    const all = await this.catalog.listPublishedProducts(context, 20);
    const results = all.slice(offset, offset + PAGE_SIZE);
    return this.present(org, identityId, context, {
      intent: 'catalog.list',
      results,
      hasMore: all.length > offset + PAGE_SIZE,
      nextOffset: offset + PAGE_SIZE,
      fullCard: false,
      state: results.length > 0 ? 'ok' : 'not_found',
    });
  }

  async categories(org: OrgContext): Promise<BuyerQueryResult> {
    const { identityId, context } = await this.trustedContext(org);
    await this.clearPendingBudget(identityId, context);
    const categories = await this.catalog.listBuyerCategories(context);
    if (categories.length === 0) return this.list(org, 0);
    return {
      intent: 'catalog.categories',
      results: [],
      categories,
      hasMore: false,
      nextOffset: PAGE_SIZE,
      fullCard: false,
      state: categories.length > 0 ? 'categories' : 'not_found',
    };
  }

  async category(
    org: OrgContext,
    categoryId: string,
    offset: number,
  ): Promise<BuyerQueryResult> {
    const { identityId, context } = await this.trustedContext(org);
    await this.clearPendingBudget(identityId, context);
    const all = await this.catalog.listPublishedProductsByCategory(
      context,
      categoryId,
      20,
    );
    const results = all.slice(offset, offset + PAGE_SIZE);
    return this.present(org, identityId, context, {
      intent: 'catalog.category',
      results,
      categoryId,
      hasMore: all.length > offset + PAGE_SIZE,
      nextOffset: offset + PAGE_SIZE,
      fullCard: false,
      state: results.length > 0 ? 'ok' : 'not_found',
    });
  }

  async similar(
    org: OrgContext,
    productId: string,
  ): Promise<BuyerQueryResult> {
    const { identityId, context } = await this.trustedContext(org);
    await this.clearPendingBudget(identityId, context);
    const source = await this.catalog.getPublishedProductResult(
      context,
      productId,
    );
    const all = await this.catalog.listPublishedProducts(context, 20);
    const results = all
      .filter((candidate) => candidate.product.id !== source.product.id)
      .sort((left, right) => {
        const leftCategory =
          left.product.categoryId === source.product.categoryId ? 0 : 1;
        const rightCategory =
          right.product.categoryId === source.product.categoryId ? 0 : 1;
        const leftAvailability =
          left.product.availability === 'available' ? 0 : 1;
        const rightAvailability =
          right.product.availability === 'available' ? 0 : 1;
        return leftCategory - rightCategory
          || leftAvailability - rightAvailability
          || Math.abs(left.product.priceMinor - source.product.priceMinor)
            - Math.abs(right.product.priceMinor - source.product.priceMinor)
          || compareText(
            normalizedProductName(left.product.name),
            normalizedProductName(right.product.name),
          )
          || compareText(left.product.id, right.product.id);
      })
      .slice(0, PAGE_SIZE);
    return this.present(org, identityId, context, {
      intent: 'catalog.similar',
      results,
      hasMore: false,
      nextOffset: PAGE_SIZE,
      fullCard: false,
      state: results.length > 0 ? 'ok' : 'not_found',
    });
  }

  async addComparison(
    org: OrgContext,
    productId: string,
  ): Promise<BuyerQueryResult> {
    const { identityId, context } = await this.trustedContext(org);
    await this.clearPendingBudget(identityId, context);
    try {
      const comparison = await this.catalog.addStorefrontComparison({
        botUsername: this.botUsername,
        identityId,
        context,
        productId,
      });
      const state = comparison.outcome === 'duplicate'
        ? 'comparison_duplicate'
        : comparison.outcome === 'full'
          ? 'comparison_full'
          : comparison.results.length >= 2
            ? 'comparison_ready'
            : 'comparison_waiting';
      return {
        intent: 'catalog.compare',
        results: comparison.results,
        hasMore: false,
        nextOffset: PAGE_SIZE,
        fullCard: false,
        state,
      };
    } catch (error) {
      if (error instanceof CatalogNotFoundError) {
        return {
          intent: 'catalog.compare',
          results: [],
          hasMore: false,
          nextOffset: PAGE_SIZE,
          fullCard: false,
          state: 'not_found',
        };
      }
      throw error;
    }
  }

  async showComparison(org: OrgContext): Promise<BuyerQueryResult> {
    const { identityId, context } = await this.trustedContext(org);
    await this.clearPendingBudget(identityId, context);
    const comparison = await this.catalog.listStorefrontComparison({
      botUsername: this.botUsername,
      identityId,
      context,
    });
    return {
      intent: 'catalog.compare',
      results: comparison.results,
      hasMore: false,
      nextOffset: PAGE_SIZE,
      fullCard: false,
      state: comparison.results.length === 0
        ? 'comparison_empty'
        : comparison.results.length === 1
          ? 'comparison_waiting'
          : 'comparison_ready',
    };
  }

  async clearComparison(org: OrgContext): Promise<BuyerQueryResult> {
    const { identityId, context } = await this.trustedContext(org);
    await this.clearPendingBudget(identityId, context);
    await this.catalog.clearStorefrontComparison({
      botUsername: this.botUsername,
      identityId,
      context,
    });
    return {
      intent: 'catalog.compare',
      results: [],
      hasMore: false,
      nextOffset: PAGE_SIZE,
      fullCard: false,
      state: 'comparison_cleared',
    };
  }

  async requestBudget(org: OrgContext): Promise<BuyerQueryResult> {
    const { identityId, context } = await this.trustedContext(org);
    await this.catalog.setStorefrontPendingBudget({
      botUsername: this.botUsername,
      identityId,
      context,
      requestId: org.requestId,
    });
    return {
      intent: 'catalog.confirm_budget',
      results: [],
      hasMore: false,
      nextOffset: PAGE_SIZE,
      fullCard: false,
      state: 'budget_prompt',
    };
  }

  async resolveBudget(
    org: OrgContext,
    amountMinor: number,
  ): Promise<BuyerQueryResult> {
    const { identityId, context } = await this.trustedContext(org);
    const pending = await this.catalog.consumeStorefrontPendingBudget({
      botUsername: this.botUsername,
      identityId,
      context,
    });
    if (pending) return this.filterPrice(org, amountMinor, 0);
    return {
      intent: 'catalog.confirm_budget',
      results: [],
      hasMore: false,
      nextOffset: PAGE_SIZE,
      fullCard: false,
      state: 'budget_confirmation',
      maxPriceMinor: amountMinor,
    };
  }

  async search(
    org: OrgContext,
    intent: Extract<
      BuyerIntent,
      | 'catalog.search'
      | 'product.price'
      | 'product.availability'
      | 'product.details'
    >,
    productQuery: string,
  ): Promise<BuyerQueryResult> {
    const { identityId, context } = await this.trustedContext(org);
    await this.clearPendingBudget(identityId, context);
    const ranked = await this.catalog.searchPublishedProducts(
      context,
      productQuery,
      PAGE_SIZE,
    );
    const exact = ranked[0]?.score === 4_000;
    const results = exact ? ranked.slice(0, 1) : ranked.slice(0, PAGE_SIZE);
    if (exact) {
      await this.remember(
        org,
        identityId,
        context,
        intent,
        results[0].product.id,
      );
    }
    return this.present(org, identityId, context, {
      intent,
      results,
      hasMore: false,
      nextOffset: PAGE_SIZE,
      fullCard: exact,
      state: results.length > 0 ? 'ok' : 'not_found',
    });
  }

  async get(
    org: OrgContext,
    intent: Extract<
      BuyerIntent,
      'product.price' | 'product.availability' | 'product.details'
    >,
    input: { productRef?: string; usePrevious?: boolean },
  ): Promise<BuyerQueryResult> {
    const { identityId, context } = await this.trustedContext(org);
    await this.clearPendingBudget(identityId, context);
    let productRef = input.productRef;
    if (input.usePrevious) {
      const selection = await this.catalog.resolveStoredProductSelection(
        this.botUsername,
        identityId,
      );
      if (
        !selection
        || selection.context.orgId !== context.orgId
        || selection.context.storeId !== context.storeId
      ) {
        return {
          intent,
          results: [],
          hasMore: false,
          nextOffset: PAGE_SIZE,
          fullCard: false,
          state: 'missing_previous',
        };
      }
      productRef = selection.productId;
    }
    if (!productRef) throw new BuyerSessionError();
    try {
      const result = await this.catalog.getPublishedProductResult(
        context,
        productRef,
      );
      await this.remember(
        org,
        identityId,
        context,
        intent,
        result.product.id,
      );
      return this.present(org, identityId, context, {
        intent,
        results: [result],
        hasMore: false,
        nextOffset: PAGE_SIZE,
        fullCard: true,
        state: 'ok',
      });
    } catch (error) {
      if (error instanceof CatalogNotFoundError) {
        return {
          intent,
          results: [],
          hasMore: false,
          nextOffset: PAGE_SIZE,
          fullCard: false,
          state: input.usePrevious ? 'missing_previous' : 'not_found',
        };
      }
      throw error;
    }
  }

  async filterPrice(
    org: OrgContext,
    maxPriceMinor: number,
    offset: number,
  ): Promise<BuyerQueryResult> {
    const { identityId, context } = await this.trustedContext(org);
    await this.clearPendingBudget(identityId, context);
    const all = (await this.catalog.listPublishedProducts(context, 20))
      .filter(({ product }) => product.priceMinor <= maxPriceMinor)
      .sort(
        (left, right) =>
          left.product.priceMinor - right.product.priceMinor
          || compareText(
            normalizedProductName(left.product.name),
            normalizedProductName(right.product.name),
          )
          || compareText(left.product.id, right.product.id),
      );
    const results = all.slice(offset, offset + PAGE_SIZE);
    return this.present(org, identityId, context, {
      intent: 'catalog.filter_price',
      results,
      hasMore: all.length > offset + PAGE_SIZE,
      nextOffset: offset + PAGE_SIZE,
      fullCard: false,
      state: results.length > 0 ? 'ok' : 'not_found',
      maxPriceMinor,
    });
  }
}

export function createSotuvchiBuyerQueryService(
  catalog: SotuvchiCatalogService,
  botUsername: string,
): SotuvchiBuyerQueryService {
  return new SotuvchiBuyerQueryService(catalog, botUsername);
}
