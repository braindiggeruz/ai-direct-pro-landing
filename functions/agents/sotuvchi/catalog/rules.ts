import type {
  DeterministicRule,
  RuntimeMessage,
  RuntimeStepResult,
} from '../../../platform/contracts';

function textOf(message: RuntimeMessage): string | null {
  return message.kind === 'text' ? message.text.trim() : null;
}

function answer(text: string): RuntimeStepResult {
  return {
    kind: 'answer',
    response: { messages: [{ text }], claims: [] },
    facts: [],
  };
}

function menuPrompt(locale: 'ru' | 'uz', kind: 'add' | 'publish' | 'hide') {
  const text = {
    ru: {
      add:
        'Отправьте: Товар: название | цена целым числом | '
        + 'available, unavailable или preorder | описание',
      publish: 'Отправьте: Опубликовать: идентификатор | версия',
      hide: 'Отправьте: Скрыть: идентификатор | версия',
    },
    uz: {
      add:
        'Yuboring: Mahsulot: nomi | butun narx | '
        + 'available, unavailable yoki preorder | tavsif',
      publish: 'Yuboring: Nashr: identifikator | versiya',
      hide: 'Yuboring: Yashirish: identifikator | versiya',
    },
  } as const;
  return answer(text[locale][kind]);
}

function splitFields(value: string): string[] {
  return value.split('|').map((field) => field.trim());
}

function parsePositiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseCatalogBuyerQuery(value: string): string {
  return value
    .trim()
    .replace(/^(?:сколько\s+стоит|есть\s+ли)\s+/iu, '')
    .replace(/^(?:narxi|bormi)\s+/iu, '')
    .trim();
}

function isListQuery(value: string): boolean {
  const normalized = value.toLowerCase().trim();
  return [
    'что у вас есть',
    'каталог',
    'товары',
    'nima bor',
    'katalog',
    'mahsulotlar',
  ].includes(normalized);
}

export const sotuvchiCatalogMenuRule: DeterministicRule = {
  id: 'catalog-menu-action',
  priority: 40,
  match(input) {
    return input.message.kind === 'action'
      && input.message.actionId.startsWith('catalog-');
  },
  async execute(context, input) {
    if (input.message.kind !== 'action') return { kind: 'reject', reasonCode: 'rejected' };
    switch (input.message.actionId) {
      case 'catalog-add-product':
        return menuPrompt(context.org.locale, 'add');
      case 'catalog-my-products':
        return {
          kind: 'tool',
          toolName: 'catalog.product.list',
          input: {},
        };
      case 'catalog-categories':
        return {
          kind: 'tool',
          toolName: 'catalog.category.list',
          input: {},
        };
      case 'catalog-publish-product':
        return menuPrompt(context.org.locale, 'publish');
      case 'catalog-hide-product':
        return menuPrompt(context.org.locale, 'hide');
      default:
        return { kind: 'reject', reasonCode: 'rejected' };
    }
  },
};

export const sotuvchiCategoryCommandRule: DeterministicRule = {
  id: 'catalog-category-command',
  priority: 50,
  match(input) {
    const text = textOf(input.message);
    return text !== null && /^(?:категория|kategoriya)\s*:/iu.test(text);
  },
  async execute(context, input) {
    const text = textOf(input.message) ?? '';
    const name = text.replace(/^(?:категория|kategoriya)\s*:/iu, '').trim();
    if (!name) {
      return answer(
        context.org.locale === 'ru'
          ? 'Укажите название категории после двоеточия.'
          : 'Ikki nuqtadan keyin kategoriya nomini kiriting.',
      );
    }
    return {
      kind: 'tool',
      toolName: 'catalog.category.create',
      input: { name },
    };
  },
};

export const sotuvchiProductCreateCommandRule: DeterministicRule = {
  id: 'catalog-product-create-command',
  priority: 60,
  match(input) {
    const text = textOf(input.message);
    return text !== null && /^(?:товар|mahsulot)\s*:/iu.test(text);
  },
  async execute(context, input) {
    const text = textOf(input.message) ?? '';
    const fields = splitFields(
      text.replace(/^(?:товар|mahsulot)\s*:/iu, ''),
    );
    const priceMinor = parsePositiveInteger(fields[1] ?? '');
    if (
      fields.length < 3
      || !fields[0]
      || priceMinor === null
      || !['available', 'unavailable', 'preorder'].includes(fields[2])
    ) {
      return menuPrompt(context.org.locale, 'add');
    }
    return {
      kind: 'tool',
      toolName: 'catalog.product.create',
      input: {
        name: fields[0],
        priceMinor,
        currency: 'UZS',
        availability: fields[2],
        ...(fields[3] ? { description: fields[3] } : {}),
        ...(fields[4] ? { categoryId: fields[4] } : {}),
        ...(fields[5] ? { sku: fields[5] } : {}),
      },
    };
  },
};

function lifecycleCommand(
  message: RuntimeMessage,
  expression: RegExp,
): { productId: string; expectedVersion: number } | null {
  const text = textOf(message);
  if (!text) return null;
  const match = expression.exec(text);
  if (!match) return null;
  const expectedVersion = parsePositiveInteger(match[2]);
  return expectedVersion === null
    ? null
    : { productId: match[1], expectedVersion };
}

export const sotuvchiProductPublishCommandRule: DeterministicRule = {
  id: 'catalog-product-publish-command',
  priority: 70,
  match(input) {
    return textOf(input.message) !== null
      && /^(?:опубликовать|nashr)\s*:/iu.test(textOf(input.message) ?? '');
  },
  async execute(context, input) {
    const parsed = lifecycleCommand(
      input.message,
      /^(?:опубликовать|nashr)\s*:\s*([a-z0-9-]+)\s*\|\s*(\d+)\s*$/iu,
    );
    return parsed
      ? { kind: 'tool', toolName: 'catalog.product.publish', input: parsed }
      : menuPrompt(context.org.locale, 'publish');
  },
};

export const sotuvchiProductHideCommandRule: DeterministicRule = {
  id: 'catalog-product-hide-command',
  priority: 80,
  match(input) {
    return textOf(input.message) !== null
      && /^(?:скрыть|yashirish)\s*:/iu.test(textOf(input.message) ?? '');
  },
  async execute(context, input) {
    const parsed = lifecycleCommand(
      input.message,
      /^(?:скрыть|yashirish)\s*:\s*([a-z0-9-]+)\s*\|\s*(\d+)\s*$/iu,
    );
    return parsed
      ? { kind: 'tool', toolName: 'catalog.product.unpublish', input: parsed }
      : menuPrompt(context.org.locale, 'hide');
  },
};

export const sotuvchiProductListCommandRule: DeterministicRule = {
  id: 'catalog-product-list-command',
  priority: 90,
  match(input) {
    const text = textOf(input.message)?.toLowerCase();
    return text === 'мои товары' || text === 'mening mahsulotlarim';
  },
  async execute() {
    return {
      kind: 'tool',
      toolName: 'catalog.product.list',
      input: {},
    };
  },
};

export const sotuvchiCategoryListCommandRule: DeterministicRule = {
  id: 'catalog-category-list-command',
  priority: 100,
  match(input) {
    const text = textOf(input.message)?.toLowerCase();
    return text === 'категории' || text === 'kategoriyalar';
  },
  async execute() {
    return {
      kind: 'tool',
      toolName: 'catalog.category.list',
      input: {},
    };
  },
};

export const sotuvchiBuyerCatalogRule: DeterministicRule = {
  id: 'catalog-buyer-search',
  priority: 200,
  match(input) {
    return input.message.kind === 'text';
  },
  async execute(_context, input) {
    if (input.message.kind !== 'text') {
      return { kind: 'reject', reasonCode: 'rejected' };
    }
    if (isListQuery(input.message.text)) {
      return {
        kind: 'tool',
        toolName: 'catalog.product.search',
        input: { limit: 5 },
      };
    }
    const query = parseCatalogBuyerQuery(input.message.text);
    return query
      ? {
          kind: 'tool',
          toolName: 'catalog.product.search',
          input: { query, limit: 5 },
        }
      : { kind: 'reject', reasonCode: 'rejected' };
  },
};

export const sotuvchiCatalogRules = [
  sotuvchiCatalogMenuRule,
  sotuvchiCategoryCommandRule,
  sotuvchiProductCreateCommandRule,
  sotuvchiProductPublishCommandRule,
  sotuvchiProductHideCommandRule,
  sotuvchiProductListCommandRule,
  sotuvchiCategoryListCommandRule,
] as const;
