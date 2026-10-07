/**
 * The tariffs section as static HTML, for the tariffs page built at release
 * (stream F, /uz/tariflar/): its root is
 *   `<div id="studio-root"${encodeTariffsRoot(plans, termsUrl)}>${renderTariffs(locale, plans, termsUrl)}</div>`
 * and main.tsx hydrates exactly this tree (tests/studio-billing-island.test.ts
 * compares the two). The plans come from the offer edition in force
 * (functions/lib/studio/checkout.ts publicPlans, the same list /config
 * answers).
 *
 * Rendered with this app's own react-dom/server, like
 * tools/presentation/static.ts. Never imported by main.tsx.
 */
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { StudioLocale, StudioPlanOffer } from '../api';
import { Tariffs } from './Tariffs';

/** The section's markup for a tariffs page in `locale`. */
export function renderTariffs(locale: StudioLocale, plans: readonly StudioPlanOffer[], termsUrl: string | null): string {
  return renderToString(createElement(Tariffs, { locale, context: 'page', initialPlans: plans, initialTermsUrl: termsUrl }));
}
