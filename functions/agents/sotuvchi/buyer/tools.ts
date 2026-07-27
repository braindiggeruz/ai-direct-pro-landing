import {
  eraseTool,
  type AgentDomainServicePort,
  type RuntimeSchema,
  type Tool,
} from '../../../platform/contracts';
import {
  createSotuvchiCatalogDomainPort,
  normalizeCatalogQuery,
  normalizePriceMinor,
  requireCatalogId,
  type SotuvchiCatalogService,
} from '../catalog';
import { BuyerQueryValidationError } from './errors';
import { projectBuyerFacts, type BuyerFactValues } from './facts';
import {
  isBuyerIntent,
  type BuyerIntent,
} from './intents';
import {
  createSotuvchiBuyerQueryService,
  type SotuvchiBuyerQueryService,
} from './query';
import { composeBuyerResponse } from './responses';

type SearchIntent = Extract<
  BuyerIntent,
  | 'catalog.search'
  | 'product.price'
  | 'product.availability'
  | 'product.details'
>;
type ProductIntent = Extract<
  BuyerIntent,
  'product.price' | 'product.availability' | 'product.details'
>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  return Object.keys(value).length === expected.size
    && Object.keys(value).every((key) => expected.has(key));
}

function requireOffset(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 15) {
    throw new BuyerQueryValidationError();
  }
  return Number(value);
}

function requireSearchIntent(value: unknown): SearchIntent {
  if (
    !isBuyerIntent(value)
    || ![
      'catalog.search',
      'product.price',
      'product.availability',
      'product.details',
    ].includes(value)
  ) {
    throw new BuyerQueryValidationError();
  }
  return value as SearchIntent;
}

function requireProductIntent(value: unknown): ProductIntent {
  const intent = requireSearchIntent(value);
  if (intent === 'catalog.search') throw new BuyerQueryValidationError();
  return intent;
}

const listSchema: RuntimeSchema<{ offset: number }> = {
  parse(value) {
    if (
      !isPlainObject(value)
      || !exactKeys(value, new Set(['offset']))
    ) {
      throw new BuyerQueryValidationError();
    }
    return { offset: requireOffset(value.offset) };
  },
};

const searchSchema: RuntimeSchema<{
  intent: SearchIntent;
  productQuery: string;
}> = {
  parse(value) {
    if (
      !isPlainObject(value)
      || !exactKeys(value, new Set(['intent', 'productQuery']))
    ) {
      throw new BuyerQueryValidationError();
    }
    return {
      intent: requireSearchIntent(value.intent),
      productQuery: normalizeCatalogQuery(value.productQuery).normalized,
    };
  },
};

const productSchema: RuntimeSchema<{
  intent: ProductIntent;
  productRef?: string;
  usePrevious?: true;
}> = {
  parse(value) {
    if (!isPlainObject(value) || !Object.hasOwn(value, 'intent')) {
      throw new BuyerQueryValidationError();
    }
    const intent = requireProductIntent(value.intent);
    if (
      exactKeys(value, new Set(['intent', 'productRef']))
      && typeof value.productRef === 'string'
    ) {
      return { intent, productRef: requireCatalogId(value.productRef) };
    }
    if (
      exactKeys(value, new Set(['intent', 'usePrevious']))
      && value.usePrevious === true
    ) {
      return { intent, usePrevious: true };
    }
    throw new BuyerQueryValidationError();
  },
};

const filterSchema: RuntimeSchema<{
  maxPriceMinor: number;
  offset: number;
}> = {
  parse(value) {
    if (
      !isPlainObject(value)
      || !exactKeys(value, new Set(['maxPriceMinor', 'offset']))
    ) {
      throw new BuyerQueryValidationError();
    }
    return {
      maxPriceMinor: normalizePriceMinor(value.maxPriceMinor),
      offset: requireOffset(value.offset),
    };
  },
};

function buyerTool<I>(
  name: string,
  description: string,
  inputSchema: RuntimeSchema<I>,
): Tool<I, BuyerFactValues> {
  return {
    name,
    description,
    inputSchema,
    async run(context, input) {
      const domain = context.services.agentDomain;
      if (!domain) throw new BuyerQueryValidationError();
      return domain.execute({
        agentId: 'sotuvchi',
        operation: name,
        org: context.org,
        input,
      });
    },
    facts(values) {
      return { toolName: name, values };
    },
    response: { compose: composeBuyerResponse },
  };
}

export const sotuvchiBuyerTools = [
  eraseTool(buyerTool(
    'catalog.list',
    'List published products in the trusted buyer storefront.',
    listSchema,
  )),
  eraseTool(buyerTool(
    'catalog.search',
    'Search published products for one closed buyer intent.',
    searchSchema,
  )),
  eraseTool(buyerTool(
    'catalog.product.get',
    'Read one revalidated published product or safe prior selection.',
    productSchema,
  )),
  eraseTool(buyerTool(
    'catalog.filter_price',
    'List published products at or below an integer UZS price.',
    filterSchema,
  )),
] as const;

const BUYER_OPERATIONS = new Set(
  sotuvchiBuyerTools.map((tool) => tool.name),
);

export function createSotuvchiBuyerDomainPort(
  service: SotuvchiBuyerQueryService,
): AgentDomainServicePort {
  return {
    async execute(call) {
      if (call.agentId !== 'sotuvchi') {
        throw new BuyerQueryValidationError();
      }
      switch (call.operation) {
        case 'catalog.list': {
          const input = listSchema.parse(call.input);
          return projectBuyerFacts(
            await service.list(call.org, input.offset),
            call.org.locale,
          );
        }
        case 'catalog.search': {
          const input = searchSchema.parse(call.input);
          return projectBuyerFacts(
            await service.search(
              call.org,
              input.intent,
              input.productQuery,
            ),
            call.org.locale,
          );
        }
        case 'catalog.product.get': {
          const input = productSchema.parse(call.input);
          return projectBuyerFacts(
            await service.get(call.org, input.intent, input),
            call.org.locale,
          );
        }
        case 'catalog.filter_price': {
          const input = filterSchema.parse(call.input);
          return projectBuyerFacts(
            await service.filterPrice(
              call.org,
              input.maxPriceMinor,
              input.offset,
            ),
            call.org.locale,
          );
        }
        default:
          throw new BuyerQueryValidationError();
      }
    },
  };
}

export function createSotuvchiDomainPort(
  catalog: SotuvchiCatalogService,
  botUsername: string,
): AgentDomainServicePort {
  const buyer = createSotuvchiBuyerDomainPort(
    createSotuvchiBuyerQueryService(catalog, botUsername),
  );
  const seller = createSotuvchiCatalogDomainPort(catalog);
  return {
    execute(call) {
      return BUYER_OPERATIONS.has(call.operation)
        ? buyer.execute(call)
        : seller.execute(call);
    },
  };
}
