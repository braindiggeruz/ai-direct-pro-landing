/** @jsxRuntime automatic @jsxImportSource react */
/**
 * The neutral «Tariflar» section (DECISIONS §1(д), §13 п. 3): under a free
 * result, below the free-limit card (whose first line, «when free again»,
 * is the form's), and on the tariffs page /uz/tariflar/.
 *
 * Oylik first, Kunlik on the line below, the free allowance, the chat's AI
 * paket «faqat chat uchun», «Obunasiz…», the provider, the refund line and
 * the offer. No tariff is chosen in advance, there is no timer and no call
 * to buy: each tariff has a plain «… tanlash» button that opens the
 * checkout (Checkout.tsx) right under it. While sales are off the prices
 * stay and the buttons give way to «To‘lov vaqtincha to‘xtatilgan»; until
 * /config has answered the line names no provider and no pause, so a slow
 * or blocked answer (a crawler) never reads as «paused».
 *
 * TariffList is the markup alone. Tariffs is the live section:
 *   - under a result or on the limit card it reads /config when it appears
 *     (it appears only after the person acted) and records that the
 *     tariffs were seen;
 *   - on the tariffs page (context 'page') it is hydrated over the
 *     prerendered markup (static.ts renderTariffs, the plans of the edition
 *     in force) and asks /config only when a tariff's button is pressed, so
 *     the page makes no request on load.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { StudioLocale, StudioPlanId, StudioPlanOffer, StudioProvider, StudioPublicConfig } from '../api';
import { Checkout } from './Checkout';
import { sellingProviders } from './flow';
import { billingRuntime, type BillingRuntime } from './runtime';
import { BILLING_TEXTS } from './texts';

/** Where the section stands. */
export type TariffsContext = 'after_result' | 'limit' | 'page';

/** The chat the AI paket belongs to, per page language. */
export const CHAT_PAGE: Readonly<Record<StudioLocale, string>> = { uz: '/uz/gpt-uzbek-tilida/', ru: '/ru/gpt-chat/' };

/** Oylik first, then Kunlik (DECISIONS §13 п. 3). */
export const PLAN_ORDER: readonly StudioPlanId[] = ['oylik', 'kunlik'];

const BOX = 'st:mt-4 st:rounded-2xl st:border st:border-studio-line st:bg-studio-elevated st:p-4 st:text-studio-text';
const LINE = 'st:text-sm st:leading-snug st:text-studio-muted';
const CHOOSE =
  'st:mt-2 st:min-h-11 st:rounded-xl st:border st:border-studio-line st:bg-studio-bg st:px-3 st:py-2 st:text-sm st:font-medium st:text-studio-text st:focus-visible:outline-2 st:focus-visible:outline-offset-2 st:focus-visible:outline-studio-cyan';

export interface TariffListProps {
  readonly locale: StudioLocale;
  readonly plans: readonly StudioPlanOffer[];
  /**
   * The providers that sell now; [] means sales are off («To‘lov vaqtincha
   * to‘xtatilgan»); null means not known yet (no provider, no pause).
   */
  readonly providers: readonly StudioProvider[] | null;
  /** The offer in the page's language. */
  readonly termsUrl: string | null;
  /** A plan's button was pressed; without it the list shows no buttons (a static list). */
  readonly onChoose?: (plan: StudioPlanId) => void;
  /** The plan whose checkout is open: its button reads as pressed. */
  readonly chosen?: StudioPlanId | null;
  /** A button press is being answered (the page's lazy /config). */
  readonly busy?: boolean;
  readonly context: TariffsContext;
}

export function TariffList({ locale, plans, providers, termsUrl, onChoose, chosen = null, busy = false, context }: TariffListProps) {
  const texts = BILLING_TEXTS[locale];
  const id = useId();
  const ordered = PLAN_ORDER.flatMap((planId) => plans.filter((plan) => plan.id === planId));
  const buttons = !!onChoose && (providers === null || providers.length > 0);
  const payment = providers === null ? '' : providers.length ? ` ${texts.payWith(providers)}` : ` ${texts.paused}`;
  return (
    <section className={BOX} aria-labelledby={`${id}-tariffs`} data-studio-tariffs={context}>
      <h2 id={`${id}-tariffs`} className="st:text-base st:font-semibold st:text-studio-text">
        {texts.heading}
      </h2>
      <p className={`st:mt-1 ${LINE}`}>{texts.free}</p>
      {ordered.length ? (
        <ul className="st:mt-3 st:space-y-3">
          {ordered.map((plan) => (
            <li key={plan.id} data-studio-plan={plan.id}>
              <p className="st:text-sm st:leading-snug st:text-studio-text">{texts.plan(plan.id, plan)}</p>
              {buttons ? (
                <button type="button" className={CHOOSE} aria-pressed={chosen === plan.id} disabled={busy} onClick={() => onChoose?.(plan.id)}>
                  {texts.choose[plan.id]}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className={`st:mt-3 ${LINE}`}>
        {texts.chatPack}{' '}
        <a className="st:text-studio-cyan st:underline" href={CHAT_PAGE[locale]}>
          {texts.chatPackLink}
        </a>
      </p>
      <p className={`st:mt-2 ${LINE}`} data-studio-pay-note="">
        {`${texts.noSubscription}${payment}`}
      </p>
      <p className={`st:mt-1 ${LINE}`}>{texts.refund}</p>
      {termsUrl ? (
        <p className={`st:mt-1 ${LINE}`}>
          <a className="st:text-studio-cyan st:underline" href={termsUrl} target="_blank" rel="noopener">
            {texts.offer}
          </a>
        </p>
      ) : null}
    </section>
  );
}

export interface TariffsProps {
  readonly locale: StudioLocale;
  readonly context: TariffsContext;
  /** The tariffs page: the plans and offer link it was prerendered with (tariffs-root.ts). */
  readonly initialPlans?: readonly StudioPlanOffer[];
  readonly initialTermsUrl?: string | null;
  /** Tests pass their own. */
  readonly runtime?: BillingRuntime;
}

/** The section with live prices and the checkout. */
export function Tariffs({ locale, context, initialPlans, initialTermsUrl = null, runtime }: TariffsProps) {
  const texts = BILLING_TEXTS[locale];
  const [expanded, setExpanded] = useState(context !== 'after_result');
  const [dismissed, setDismissed] = useState(false);
  const [config, setConfig] = useState<StudioPublicConfig | null>(null);
  const [chosen, setChosen] = useState<StudioPlanId | null>(null);
  const [asking, setAsking] = useState(false);
  const [configError, setConfigError] = useState(false);
  const alive = useRef(true);
  const configRequest = useRef(false);
  const requestedPlan = useRef<StudioPlanId | null>(null);

  const loadConfig = useCallback(async () => {
    if (configRequest.current) return;
    configRequest.current = true;
    setAsking(true);
    try {
      const result = await (runtime ?? billingRuntime()).session.config();
      if (!alive.current) return;
      setConfigError(!result.ok);
      if (result.ok) {
        setConfig(result.data);
        const wanted = requestedPlan.current;
        if (wanted && sellingProviders(result.data).length && result.data.plans.some((offer) => offer.id === wanted)) setChosen(wanted);
      }
    } catch {
      if (alive.current) setConfigError(true);
    } finally {
      configRequest.current = false;
      if (alive.current) setAsking(false);
    }
  }, [runtime]);

  useEffect(() => {
    alive.current = true;
    if (context === 'after_result') {
      try { if (sessionStorage.getItem('studio-upgrade-dismissed') === '1') { setDismissed(true); return; } } catch { /* Storage is optional. */ }
    }
    if (context !== 'page') {
      const live = runtime ?? billingRuntime();
      void loadConfig();
      live.funnel.tariffsViewed(context);
    }
    return () => {
      alive.current = false;
    };
  }, [context, runtime, loadConfig]);

  // The tariffs page asks /config on the first press only, then opens the checkout if that tariff sells.
  const choose = (plan: StudioPlanId) => {
    if (config) {
      setChosen(plan);
      return;
    }
    requestedPlan.current = plan;
    void loadConfig();
  };

  // Only the release's prerendered offer is a price fallback. A failed
  // request never invents prices, a provider or a payment availability state.
  const plans = config?.plans ?? initialPlans ?? [];
  const providers = config ? sellingProviders(config) : null;
  const termsUrl = config ? config.terms?.[locale] ?? null : initialTermsUrl;
  const plan = chosen && config ? config.plans.find((offer) => offer.id === chosen) ?? null : null;
  if (dismissed) return null;
  const configNotice = configError ? (
    <div className="st:mt-3 st:space-y-2" role="status" data-studio-config-error="">
      <p className={LINE}>{locale === 'ru' ? 'Не удалось загрузить условия оплаты. Повторите попытку.' : 'To‘lov shartlarini yuklab bo‘lmadi. Qayta urinib ko‘ring.'}</p>
      <button type="button" className={CHOOSE} disabled={asking} onClick={() => void loadConfig()} data-studio-config-retry="">
        {asking ? texts.paying : locale === 'ru' ? 'Повторить' : 'Qayta urinish'}
      </button>
    </div>
  ) : null;
  const dismissButton = context === 'after_result' ? (
    <button type="button" className="st:px-3 st:py-3 st:text-sm st:text-studio-muted st:underline" data-studio-upgrade-dismiss="" onClick={() => {
      setDismissed(true);
      try { sessionStorage.setItem('studio-upgrade-dismissed', '1'); } catch { /* Storage is optional. */ }
    }}>{locale === 'ru' ? 'Позже' : 'Keyinroq'}</button>
  ) : null;
  // Show value after delivery. Never interrupts input, hides the free file,
  // makes an order on view, or reappears after dismissal in this tab.
  if (context === 'after_result' && !expanded) return (
    <section className={BOX} data-studio-upgrade="after_result" aria-label={locale === 'ru' ? 'Полная презентация' : 'To‘liq taqdimot'}>
      <h3 className="st:font-semibold">{locale === 'ru' ? 'Нужно больше, чем бесплатный пример?' : 'Bepul namunadan ko‘proq kerakmi?'}</h3>
      <p className={`st:mt-1 ${LINE}`}>{locale === 'ru' ? `До ${config?.shapes.full.maxSlides ?? 12} слайдов, заметки докладчика, до 8 изображений и 3 палитры.` : `${config?.shapes.full.maxSlides ?? 12} slaydgacha, ma’ruzachi izohlari, 8 rasmgacha va 3 palitra.`}</p>
      {PLAN_ORDER.flatMap(id=>plans.filter(plan=>plan.id===id)).map(plan=><p key={plan.id} className={`st:mt-1 ${LINE}`}>{texts.plan(plan.id,plan)}</p>)}
      <p className={`st:mt-1 ${LINE}`}>{texts.noSubscription}{providers?.length === 0 ? ` ${texts.paused}` : ''}</p>
      {configNotice}
      <div className="st:mt-2 st:flex st:flex-wrap st:items-center st:gap-3">
        <button type="button" className={CHOOSE} onClick={()=>setExpanded(true)}>{locale === 'ru' ? 'Посмотреть тарифы' : 'Tariflarni ko‘rish'}</button>
        {dismissButton}
      </div>
    </section>
  );
  return (
    <div data-studio-billing="">
      <TariffList locale={locale} plans={plans} providers={providers} termsUrl={termsUrl} onChoose={choose} chosen={chosen} busy={asking} context={context} />
      {configNotice}
      {plan && config ? <Checkout key={plan.id} locale={locale} plan={plan} config={config} runtime={runtime} onClose={() => setChosen(null)} /> : null}
      {dismissButton}
    </div>
  );
}
