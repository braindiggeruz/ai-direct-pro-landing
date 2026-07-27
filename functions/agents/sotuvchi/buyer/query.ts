import type { OrgContext } from '../../../platform/contracts';
import {
  CatalogNotFoundError,
  normalizedProductName,
  type CatalogSearchResult,
  type SotuvchiCatalogService,
  type StorefrontContext,
} from '../catalog';
import { BuyerSessionError } from './errors';
import type { BuyerIntent } from './intents';

const PAGE_SIZE = 5;

export interface BuyerQueryResult {
  intent: BuyerIntent;
  results: readonly CatalogSearchResult[];
  hasMore: boolean;
  nextOffset: number;
  fullCard: boolean;
  state: 'ok' | 'not_found' | 'missing_previous';
  maxPriceMinor?: number;
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

  async list(
    org: OrgContext,
    offset: number,
  ): Promise<BuyerQueryResult> {
    const { context } = await this.trustedContext(org);
    const all = await this.catalog.listPublishedProducts(context, 20);
    const results = all.slice(offset, offset + PAGE_SIZE);
    return {
      intent: 'catalog.list',
      results,
      hasMore: all.length > offset + PAGE_SIZE,
      nextOffset: offset + PAGE_SIZE,
      fullCard: false,
      state: results.length > 0 ? 'ok' : 'not_found',
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
    return {
      intent,
      results,
      hasMore: false,
      nextOffset: PAGE_SIZE,
      fullCard: exact,
      state: results.length > 0 ? 'ok' : 'not_found',
    };
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
      return {
        intent,
        results: [result],
        hasMore: false,
        nextOffset: PAGE_SIZE,
        fullCard: true,
        state: 'ok',
      };
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
    const { context } = await this.trustedContext(org);
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
    return {
      intent: 'catalog.filter_price',
      results,
      hasMore: all.length > offset + PAGE_SIZE,
      nextOffset: offset + PAGE_SIZE,
      fullCard: false,
      state: results.length > 0 ? 'ok' : 'not_found',
      maxPriceMinor,
    };
  }
}

export function createSotuvchiBuyerQueryService(
  catalog: SotuvchiCatalogService,
  botUsername: string,
): SotuvchiBuyerQueryService {
  return new SotuvchiBuyerQueryService(catalog, botUsername);
}
