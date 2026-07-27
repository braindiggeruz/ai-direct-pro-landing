import {
  eraseTool,
  type AgentDomainServicePort,
  type FactValue,
  type Locale,
  type OrgContext,
  type RuntimeSchema,
  type Tool,
} from '../../../platform/contracts';
import type {
  CatalogCategory,
  CatalogProduct,
  CatalogSearchResult,
  StoreOwnerContext,
  StorefrontContext,
} from './types';
import {
  availabilityLabel,
  formatUzsPrice,
  type SotuvchiCatalogService,
} from './service';
import {
  normalizeCreateCategoryInput,
  normalizeCreateProductInput,
  normalizeProductFilter,
  normalizeUpdateCategoryInput,
  normalizeUpdateProductInput,
  requireCatalogId,
  requireCatalogLimit,
  requireProductVersion,
} from './validation';
import { CatalogAuthorizationError, CatalogValidationError } from './errors';

const RESPONSE_KEY = 'catalog.response.text';
type CatalogFactValues = Readonly<Record<string, FactValue>>;

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

const emptySchema: RuntimeSchema<Record<string, never>> = {
  parse(value) {
    if (!isPlainObject(value) || Object.keys(value).length !== 0) {
      throw new CatalogValidationError('invalid_patch');
    }
    return {};
  },
};

const categoryCreateSchema: RuntimeSchema<
  ReturnType<typeof normalizeCreateCategoryInput>
> = { parse: normalizeCreateCategoryInput };

const categoryUpdateSchema: RuntimeSchema<{
  categoryId: string;
  patch: ReturnType<typeof normalizeUpdateCategoryInput>;
}> = {
  parse(value) {
    if (
      !isPlainObject(value)
      || !exactKeys(value, new Set(['categoryId', 'patch']))
    ) {
      throw new CatalogValidationError('invalid_patch');
    }
    return {
      categoryId: requireCatalogId(value.categoryId),
      patch: normalizeUpdateCategoryInput(value.patch),
    };
  },
};

const categoryRefSchema: RuntimeSchema<{ categoryId: string }> = {
  parse(value) {
    if (
      !isPlainObject(value)
      || !exactKeys(value, new Set(['categoryId']))
    ) {
      throw new CatalogValidationError('invalid_id');
    }
    return { categoryId: requireCatalogId(value.categoryId) };
  },
};

const productCreateSchema: RuntimeSchema<
  ReturnType<typeof normalizeCreateProductInput>
> = { parse: normalizeCreateProductInput };

const productListSchema: RuntimeSchema<
  ReturnType<typeof normalizeProductFilter>
> = { parse: normalizeProductFilter };

const productUpdateSchema: RuntimeSchema<{
  productId: string;
  expectedVersion: number;
  patch: ReturnType<typeof normalizeUpdateProductInput>;
}> = {
  parse(value) {
    if (
      !isPlainObject(value)
      || !exactKeys(
        value,
        new Set(['productId', 'expectedVersion', 'patch']),
      )
    ) {
      throw new CatalogValidationError('invalid_patch');
    }
    return {
      productId: requireCatalogId(value.productId),
      expectedVersion: requireProductVersion(value.expectedVersion),
      patch: normalizeUpdateProductInput(value.patch),
    };
  },
};

const productRefSchema: RuntimeSchema<{
  productId: string;
  expectedVersion: number;
}> = {
  parse(value) {
    if (
      !isPlainObject(value)
      || !exactKeys(value, new Set(['productId', 'expectedVersion']))
    ) {
      throw new CatalogValidationError('invalid_id');
    }
    return {
      productId: requireCatalogId(value.productId),
      expectedVersion: requireProductVersion(value.expectedVersion),
    };
  },
};

const productSearchSchema: RuntimeSchema<{
  query?: string;
  limit: number;
}> = {
  parse(value) {
    if (
      !isPlainObject(value)
      || Object.keys(value).some(
        (key) => key !== 'query' && key !== 'limit',
      )
      || (
        value.query !== undefined
        && (typeof value.query !== 'string' || value.query.length === 0)
      )
    ) {
      throw new CatalogValidationError('invalid_query');
    }
    return {
      ...(value.query === undefined ? {} : { query: value.query }),
      limit: requireCatalogLimit(value.limit, 5),
    };
  },
};

const productGetSchema: RuntimeSchema<{ productId: string }> = {
  parse(value) {
    if (
      !isPlainObject(value)
      || !exactKeys(value, new Set(['productId']))
    ) {
      throw new CatalogValidationError('invalid_id');
    }
    return { productId: requireCatalogId(value.productId) };
  },
};

function responseTool<I>(
  name: string,
  description: string,
  inputSchema: RuntimeSchema<I>,
): Tool<I, CatalogFactValues> {
  return {
    name,
    description,
    inputSchema,
    async run(context, input) {
      const domain = context.services.agentDomain;
      if (!domain) throw new CatalogAuthorizationError();
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
    response: {
      text: {
        ru: `{{${RESPONSE_KEY}}}`,
        uz: `{{${RESPONSE_KEY}}}`,
      },
    },
  };
}

export const sotuvchiCatalogTools = [
  eraseTool(responseTool(
    'catalog.category.create',
    'Create one category in the authenticated owner store.',
    categoryCreateSchema,
  )),
  eraseTool(responseTool(
    'catalog.category.list',
    'List categories in the authenticated owner store.',
    emptySchema,
  )),
  eraseTool(responseTool(
    'catalog.category.update',
    'Update one active category in the authenticated owner store.',
    categoryUpdateSchema,
  )),
  eraseTool(responseTool(
    'catalog.category.archive',
    'Archive one category in the authenticated owner store.',
    categoryRefSchema,
  )),
  eraseTool(responseTool(
    'catalog.product.create',
    'Create one draft product in the authenticated owner store.',
    productCreateSchema,
  )),
  eraseTool(responseTool(
    'catalog.product.list',
    'List products in the authenticated owner store.',
    productListSchema,
  )),
  eraseTool(responseTool(
    'catalog.product.update',
    'Update one non-archived product with an expected version.',
    productUpdateSchema,
  )),
  eraseTool(responseTool(
    'catalog.product.publish',
    'Publish one valid draft product with an expected version.',
    productRefSchema,
  )),
  eraseTool(responseTool(
    'catalog.product.unpublish',
    'Hide one published product with an expected version.',
    productRefSchema,
  )),
  eraseTool(responseTool(
    'catalog.product.archive',
    'Archive one product with an expected version.',
    productRefSchema,
  )),
] as const;

function boundedSummary(lines: readonly string[]): string {
  const joined = lines.join('\n');
  return joined.length <= 960 ? joined : `${joined.slice(0, 956)}…`;
}

function categoryFacts(
  category: CatalogCategory,
  locale: Locale,
  action: 'created' | 'updated' | 'archived',
): CatalogFactValues {
  const verbs = {
    ru: {
      created: 'Категория создана',
      updated: 'Категория обновлена',
      archived: 'Категория архивирована',
    },
    uz: {
      created: 'Kategoriya yaratildi',
      updated: 'Kategoriya yangilandi',
      archived: 'Kategoriya arxivlandi',
    },
  } as const;
  const text = `${verbs[locale][action]}: ${category.name}`;
  return {
    [RESPONSE_KEY]: text,
    'catalog.category.id': category.id,
    'catalog.category.name': category.name,
    'catalog.category.status': category.status,
    'catalog.category.sort_order': category.sortOrder,
  };
}

function categoryListFacts(
  categories: readonly CatalogCategory[],
  locale: Locale,
): CatalogFactValues {
  const empty = locale === 'ru'
    ? 'Категорий пока нет.'
    : 'Kategoriyalar hali yo‘q.';
  const lines = categories.map(
    (category) =>
      `${category.name} — ${category.status} — ${category.id}`,
  );
  return {
    [RESPONSE_KEY]: lines.length > 0 ? boundedSummary(lines) : empty,
    'catalog.category.count': categories.length,
  };
}

function productFacts(
  product: CatalogProduct,
  locale: Locale,
  action: 'created' | 'updated' | 'published' | 'unpublished' | 'archived',
): CatalogFactValues {
  const verbs = {
    ru: {
      created: 'Черновик товара создан',
      updated: 'Товар обновлён',
      published: 'Товар опубликован',
      unpublished: 'Товар скрыт',
      archived: 'Товар архивирован',
    },
    uz: {
      created: 'Mahsulot qoralamasi yaratildi',
      updated: 'Mahsulot yangilandi',
      published: 'Mahsulot nashr qilindi',
      unpublished: 'Mahsulot yashirildi',
      archived: 'Mahsulot arxivlandi',
    },
  } as const;
  const price = formatUzsPrice(product.priceMinor);
  return {
    [RESPONSE_KEY]:
      `${verbs[locale][action]}: ${product.name} — ${price} UZS `
      + `— ${product.status} — ${product.id} v${product.version}`,
    'catalog.product.id': product.id,
    'catalog.product.name': product.name,
    'catalog.product.price_minor': product.priceMinor,
    'catalog.product.price_display': price,
    'catalog.product.currency': product.currency,
    'catalog.product.availability': product.availability,
    'catalog.product.status': product.status,
    'catalog.product.version': product.version,
    'catalog.product.description': product.description ?? '',
  };
}

function ownerProductListFacts(
  products: readonly CatalogProduct[],
  locale: Locale,
): CatalogFactValues {
  const empty = locale === 'ru'
    ? 'Товаров пока нет.'
    : 'Mahsulotlar hali yo‘q.';
  const lines = products.map((product) =>
    `${product.name} — ${formatUzsPrice(product.priceMinor)} UZS `
    + `— ${product.status} — ${product.id} v${product.version}`);
  return {
    [RESPONSE_KEY]: lines.length > 0 ? boundedSummary(lines) : empty,
    'catalog.product.count': products.length,
  };
}

function storefrontFacts(
  results: readonly CatalogSearchResult[],
  locale: Locale,
): CatalogFactValues {
  const empty = locale === 'ru'
    ? 'Каталог пока пуст или товар не найден.'
    : 'Katalog hozircha bo‘sh yoki mahsulot topilmadi.';
  if (results.length === 0) {
    return {
      [RESPONSE_KEY]: empty,
      'catalog.result.count': 0,
      'catalog.result.found': false,
    };
  }
  const lines = results.map(({ product }) => {
    const description = product.description
      ? ` — ${product.description.slice(0, 120)}`
      : '';
    return `${product.name} — ${formatUzsPrice(product.priceMinor)} UZS `
      + `— ${availabilityLabel(product.availability, locale)}${description}`;
  });
  const first = results[0].product;
  return {
    [RESPONSE_KEY]: boundedSummary(lines),
    'catalog.result.count': results.length,
    'catalog.result.found': true,
    'catalog.product.id': first.id,
    'catalog.product.name': first.name,
    'catalog.product.price_minor': first.priceMinor,
    'catalog.product.price_display': formatUzsPrice(first.priceMinor),
    'catalog.product.currency': first.currency,
    'catalog.product.availability': first.availability,
    'catalog.product.description': first.description ?? '',
  };
}

async function ownerContext(
  service: SotuvchiCatalogService,
  org: OrgContext,
): Promise<StoreOwnerContext> {
  if (!org.actorId) throw new CatalogAuthorizationError();
  return service.resolveOwnerContext({
    identityId: org.actorId,
    orgId: org.orgId,
    requestId: org.requestId,
    locale: org.locale,
  });
}

async function storefrontContext(
  service: SotuvchiCatalogService,
  org: OrgContext,
): Promise<StorefrontContext> {
  return service.resolveStorefrontByOrg(org.orgId, org.locale);
}

export function createSotuvchiCatalogDomainPort(
  service: SotuvchiCatalogService,
): AgentDomainServicePort {
  return {
    async execute(call) {
      if (call.agentId !== 'sotuvchi') {
        throw new CatalogAuthorizationError();
      }
      switch (call.operation) {
        case 'catalog.category.create': {
          const context = await ownerContext(service, call.org);
          const category = await service.createCategory(context, call.input);
          return categoryFacts(category, call.org.locale, 'created');
        }
        case 'catalog.category.list': {
          emptySchema.parse(call.input);
          const context = await ownerContext(service, call.org);
          return categoryListFacts(
            await service.listCategories(context),
            call.org.locale,
          );
        }
        case 'catalog.category.update': {
          const input = categoryUpdateSchema.parse(call.input);
          const context = await ownerContext(service, call.org);
          return categoryFacts(
            await service.updateCategory(
              context,
              input.categoryId,
              input.patch,
            ),
            call.org.locale,
            'updated',
          );
        }
        case 'catalog.category.archive': {
          const input = categoryRefSchema.parse(call.input);
          const context = await ownerContext(service, call.org);
          return categoryFacts(
            await service.archiveCategory(context, input.categoryId),
            call.org.locale,
            'archived',
          );
        }
        case 'catalog.product.create': {
          const context = await ownerContext(service, call.org);
          return productFacts(
            await service.createProduct(context, call.input),
            call.org.locale,
            'created',
          );
        }
        case 'catalog.product.list': {
          const input = productListSchema.parse(call.input);
          const context = await ownerContext(service, call.org);
          return ownerProductListFacts(
            await service.listProducts(context, input),
            call.org.locale,
          );
        }
        case 'catalog.product.update': {
          const input = productUpdateSchema.parse(call.input);
          const context = await ownerContext(service, call.org);
          return productFacts(
            await service.updateProduct(
              context,
              input.productId,
              input.expectedVersion,
              input.patch,
            ),
            call.org.locale,
            'updated',
          );
        }
        case 'catalog.product.publish':
        case 'catalog.product.unpublish':
        case 'catalog.product.archive': {
          const input = productRefSchema.parse(call.input);
          const context = await ownerContext(service, call.org);
          const action = call.operation.slice('catalog.product.'.length) as
            'publish' | 'unpublish' | 'archive';
          const product = action === 'publish'
            ? await service.publishProduct(
                context,
                input.productId,
                input.expectedVersion,
              )
            : action === 'unpublish'
              ? await service.unpublishProduct(
                  context,
                  input.productId,
                  input.expectedVersion,
                )
              : await service.archiveProduct(
                  context,
                  input.productId,
                  input.expectedVersion,
                );
          return productFacts(
            product,
            call.org.locale,
            action === 'publish'
              ? 'published'
              : action === 'unpublish'
                ? 'unpublished'
                : 'archived',
          );
        }
        case 'catalog.product.search': {
          const input = productSearchSchema.parse(call.input);
          const context = await storefrontContext(service, call.org);
          const results = input.query === undefined
            ? await service.listPublishedProducts(context, input.limit)
            : await service.searchPublishedProducts(
                context,
                input.query,
                input.limit,
              );
          return storefrontFacts(results, call.org.locale);
        }
        case 'catalog.product.get': {
          const input = productGetSchema.parse(call.input);
          const context = await storefrontContext(service, call.org);
          const product = await service.getPublishedProduct(
            context,
            input.productId,
          );
          return storefrontFacts([{
            product,
            categoryName: null,
            score: 4_000,
            matchedTokens: 1,
          }], call.org.locale);
        }
        default:
          throw new CatalogAuthorizationError();
      }
    },
  };
}
