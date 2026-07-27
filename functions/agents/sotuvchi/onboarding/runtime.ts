import type {
  Locale,
  RuntimeExactClaim,
  RuntimeMessage,
  RuntimeStepResult,
  WorkflowServicePort,
} from '../../../platform/contracts';
import type {
  SotuvchiIdentityContext,
  SotuvchiOnboardingSnapshot,
  StorePaymentMethod,
} from '../types';
import { SotuvchiOnboardingError } from './errors';
import type { SotuvchiOnboardingService } from './service';

const TEXT = {
  ru: {
    awaiting_name: 'Введите название магазина.',
    awaiting_locale: 'Выберите язык магазина.',
    awaiting_delivery: 'Выберите способ доставки.',
    awaiting_payment: 'Выберите доступный способ оплаты.',
    review: 'Проверьте данные магазина и подтвердите создание.',
    completed: 'Магазин создан. Ссылка витрины: ',
    cancelled: 'Создание магазина отменено.',
    invalid: 'Значение не принято. ',
  },
  uz: {
    awaiting_name: 'Do‘kon nomini kiriting.',
    awaiting_locale: 'Do‘kon tilini tanlang.',
    awaiting_delivery: 'Yetkazib berish usulini tanlang.',
    awaiting_payment: 'Mavjud to‘lov usulini tanlang.',
    review: 'Do‘kon ma’lumotlarini tekshiring va yaratishni tasdiqlang.',
    completed: 'Do‘kon yaratildi. Vitrina havolasi: ',
    cancelled: 'Do‘kon yaratish bekor qilindi.',
    invalid: 'Qiymat qabul qilinmadi. ',
  },
} as const;

function localeOf(
  snapshot: SotuvchiOnboardingSnapshot,
  fallback: Locale,
): Locale {
  return snapshot.draft.locale ?? fallback;
}

function promptFor(
  snapshot: SotuvchiOnboardingSnapshot,
  fallbackLocale: Locale,
  invalid = false,
): RuntimeStepResult {
  const locale = localeOf(snapshot, fallbackLocale);
  const copy = TEXT[locale];
  const prefix = invalid ? copy.invalid : '';
  switch (snapshot.state) {
    case 'awaiting_name':
      return answer(`${prefix}${copy.awaiting_name}`);
    case 'awaiting_locale':
      return answer(`${prefix}${copy.awaiting_locale}`, [
        { id: 'locale-ru', label: 'Русский' },
        { id: 'locale-uz', label: 'Uzbek Latin' },
      ]);
    case 'awaiting_delivery':
      return answer(`${prefix}${copy.awaiting_delivery}`, [
        { id: 'delivery-pickup', label: locale === 'ru' ? 'Самовывоз' : 'Olib ketish' },
        { id: 'delivery-delivery', label: locale === 'ru' ? 'Доставка' : 'Yetkazish' },
        { id: 'delivery-both', label: locale === 'ru' ? 'Оба' : 'Ikkalasi' },
      ]);
    case 'awaiting_payment':
      return answer(`${prefix}${copy.awaiting_payment}`, [
        { id: 'payment-cash', label: locale === 'ru' ? 'Наличные' : 'Naqd' },
        {
          id: 'payment-card-transfer',
          label: locale === 'ru' ? 'Перевод на карту' : 'Karta o‘tkazmasi',
        },
        {
          id: 'payment-cash-on-delivery',
          label: locale === 'ru' ? 'При получении' : 'Yetkazilganda',
        },
      ]);
    case 'review':
      return reviewAnswer(snapshot, locale, invalid);
    case 'completed':
      return answer(copy.completed);
    case 'cancelled':
      return answer(copy.cancelled);
    default:
      return answer(`${prefix}${copy.awaiting_name}`);
  }
}

function answer(
  text: string,
  choices?: readonly { id: string; label: string }[],
): RuntimeStepResult {
  return {
    kind: 'answer',
    response: {
      messages: [{
        text,
        ...(choices ? { choices } : {}),
      }],
      claims: [],
    },
    facts: [],
  };
}

function reviewAnswer(
  snapshot: SotuvchiOnboardingSnapshot,
  locale: Locale,
  invalid: boolean,
): RuntimeStepResult {
  const draft = snapshot.draft;
  if (
    !draft.storeName
    || !draft.locale
    || !draft.deliveryMode
    || draft.paymentMethods.length === 0
  ) {
    return answer(TEXT[locale].invalid + TEXT[locale].review);
  }
  const paymentMethods = draft.paymentMethods.join(', ');
  const paymentCount = draft.paymentMethods.length;
  const text = locale === 'ru'
    ? `${invalid ? TEXT.ru.invalid : ''}${TEXT.ru.review}\n`
      + `Название: ${draft.storeName}\n`
      + `Язык: ${draft.locale}\n`
      + `Доставка: ${draft.deliveryMode}\n`
      + `Оплата: ${paymentMethods}\n`
      + `Способов оплаты: ${paymentCount}`
    : `${invalid ? TEXT.uz.invalid : ''}${TEXT.uz.review}\n`
      + `Nomi: ${draft.storeName}\n`
      + `Til: ${draft.locale}\n`
      + `Yetkazish: ${draft.deliveryMode}\n`
      + `To‘lov: ${paymentMethods}\n`
      + `To‘lov usullari: ${paymentCount}`;
  const values = {
    'store.draft.name': draft.storeName,
    'store.draft.locale': draft.locale,
    'store.draft.delivery': draft.deliveryMode,
    'store.draft.payment_methods': paymentMethods,
    'store.draft.payment_count': paymentCount,
  } as const;
  const claims: RuntimeExactClaim[] = Object.entries(values)
    .map(([key, value]) => ({ key, value }));
  return {
    kind: 'answer',
    response: {
      messages: [{
        text,
        choices: [
          { id: 'confirm', label: locale === 'ru' ? 'Подтвердить' : 'Tasdiqlash' },
          { id: 'cancel', label: locale === 'ru' ? 'Отмена' : 'Bekor qilish' },
        ],
      }],
      claims,
    },
    facts: [{
      toolName: 'store.onboarding.review',
      values,
    }],
  };
}

function completionAnswer(
  locale: Locale,
  botUsername: string,
  storefrontCode: string,
): RuntimeStepResult {
  const url = `https://t.me/${botUsername}?start=agent_${storefrontCode}`;
  return {
    kind: 'answer',
    response: {
      messages: [{ text: `${TEXT[locale].completed}${url}` }],
      claims: [{ key: 'store.route.url', value: url }],
    },
    facts: [{
      toolName: 'store.onboarding.confirm',
      values: {
        'store.route.url': url,
        'store.route.code': storefrontCode,
      },
    }],
  };
}

function localeValue(message: RuntimeMessage): 'ru' | 'uz' | null {
  if (message.kind === 'action') {
    if (message.actionId === 'locale-ru') return 'ru';
    if (message.actionId === 'locale-uz') return 'uz';
    return null;
  }
  const value = message.text.trim().toLowerCase();
  return value === 'ru' || value === 'uz' ? value : null;
}

function deliveryValue(
  message: RuntimeMessage,
): 'pickup' | 'delivery' | 'both' | null {
  const value = message.kind === 'action'
    ? message.actionId.replace(/^delivery-/, '')
    : message.text.trim().toLowerCase();
  return value === 'pickup' || value === 'delivery' || value === 'both'
    ? value
    : null;
}

function paymentValue(
  message: RuntimeMessage,
): readonly StorePaymentMethod[] | null {
  const aliases: Readonly<Record<string, StorePaymentMethod>> = {
    'payment-cash': 'cash',
    'payment-card-transfer': 'card_transfer',
    'payment-cash-on-delivery': 'cash_on_delivery',
  };
  if (message.kind === 'action') {
    const method = aliases[message.actionId];
    return method ? [method] : null;
  }
  const values = message.text
    .toLowerCase()
    .split(/[\s,;]+/)
    .filter(Boolean);
  const allowed = new Set<StorePaymentMethod>([
    'cash',
    'card_transfer',
    'cash_on_delivery',
  ]);
  if (
    values.length === 0
    || values.some((value) => !allowed.has(value as StorePaymentMethod))
  ) {
    return null;
  }
  const methods = values as StorePaymentMethod[];
  return new Set(methods).size === methods.length ? methods : null;
}

export function createSotuvchiWorkflowPort(
  service: SotuvchiOnboardingService,
  botUsername: string,
): WorkflowServicePort {
  return {
    async handleActive(org, active, message) {
      if (!org.actorId) return { kind: 'reject', reasonCode: 'rejected' };
      const context: SotuvchiIdentityContext = {
        identityId: org.actorId,
        botUsername,
        requestId: org.requestId,
        locale: org.locale,
      };
      const current = await service.getOnboarding(context);
      if (
        !current
        || current.orgId !== org.orgId
        || current.workflowInstanceId !== active.instanceId
      ) {
        return { kind: 'reject', reasonCode: 'rejected' };
      }
      if (
        message.kind === 'action'
        && (message.actionId === 'seller-start' || message.actionId === 'start')
      ) {
        return promptFor(current, org.locale);
      }
      if (message.kind === 'action' && message.actionId === 'cancel') {
        const cancelled = await service.cancelOnboarding(
          context,
          active.expectedVersion,
        );
        return promptFor(cancelled, org.locale);
      }
      if (current.state === 'review') {
        if (message.kind !== 'action' || message.actionId !== 'confirm') {
          return promptFor(current, org.locale, true);
        }
        const completed = await service.confirmOnboarding(
          context,
          active.expectedVersion,
        );
        return completionAnswer(
          completed.store.locale,
          completed.route.botUsername,
          completed.store.storefrontCode,
        );
      }

      let step:
        | { step: 'name'; value: string }
        | { step: 'locale'; value: 'ru' | 'uz' }
        | { step: 'delivery'; value: 'pickup' | 'delivery' | 'both' }
        | { step: 'payment'; value: readonly StorePaymentMethod[] }
        | null = null;
      if (current.state === 'awaiting_name' && message.kind === 'text') {
        step = { step: 'name', value: message.text };
      } else if (current.state === 'awaiting_locale') {
        const value = localeValue(message);
        if (value) step = { step: 'locale', value };
      } else if (current.state === 'awaiting_delivery') {
        const value = deliveryValue(message);
        if (value) step = { step: 'delivery', value };
      } else if (current.state === 'awaiting_payment') {
        const value = paymentValue(message);
        if (value) step = { step: 'payment', value };
      }
      if (!step) return promptFor(current, org.locale, true);

      try {
        const updated = await service.submitOnboardingStep(context, {
          ...step,
          expectedVersion: active.expectedVersion,
          idempotencyKey: active.idempotencyKey,
        });
        return promptFor(updated, org.locale);
      } catch (error) {
        if (
          error instanceof SotuvchiOnboardingError
          && (
            error.code === 'invalid_name'
            || error.code === 'invalid_locale'
            || error.code === 'invalid_delivery'
            || error.code === 'invalid_payment'
            || error.code === 'invalid_step'
          )
        ) {
          return promptFor(current, org.locale, true);
        }
        throw error;
      }
    },
  };
}
