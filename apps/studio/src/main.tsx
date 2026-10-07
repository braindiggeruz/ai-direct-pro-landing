/** @jsxRuntime automatic @jsxImportSource react */
/**
 * Studio island entry.
 *
 * The page around the island is static HTML written at build time by
 * scripts/prerender-studio.ts; the island owns only <div id="studio-root">,
 * which wraps the tool and nothing else (H1, text and FAQ stay outside it).
 * The build writes the tool's first state into it (tools/presentation/
 * static.ts, tools/photo/static.ts, billing/static.ts) and this file
 * hydrates that markup: the same tree, so the page neither flashes nor
 * shifts. `data-tool` says which tool the page holds:
 *   presentation (or none)  the deck form, statically imported;
 *   photo                   the photo island of stream C (PhotoIsland
 *                           {locale, slots}), through import() and only if
 *                           this build has it (import.meta.glob);
 *   tariffs                 the tariffs page's section (billing/
 *                           tariffs-root.ts), through import().
 *
 * The paid stage never grows the first load (prerender-studio.ts budget):
 * the tools get their slots (slots.ts) and what fills them (the «Tariflar»
 * section and its checkout, «Mening paketim») arrives through import() when
 * a slot is shown. «Mening paketim» loads only when this browser bought here
 * before or a billing part of this view saw a studio account (billing/
 * hint.ts). The page after payment (?pay=return, billing/PayReturn.tsx) is
 * mounted in its own box above the root, never inside the hydrated tree.
 *
 * On load the island makes no network request. robots.txt closes /api/ to
 * every crawler and Google indexes the page after running its JavaScript,
 * so anything fetched on load (and any error it could show) would be what
 * lands in the index. /config and /me are asked for on the first focus or
 * submit (config.ts); Turnstile loads on submit; pptxgenjs on download. Only
 * a buyer coming back from Payme or Click (?pay=return) reads /me at once.
 *
 * The page's language is <html lang> ("uz" or "ru"). An empty root is
 * rendered instead of hydrated. A hydration mismatch is marked on the root
 * (data-hydration="recovered") for scripts/check-pages.ts; React then
 * re-renders the client tree, which is still a working tool.
 */
import { Suspense, lazy, useEffect, useState, type ComponentType, type ReactElement } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import './styles.css';
import type { StudioLocale } from './api';
import { onPack, packRemembered } from './billing/hint';
import { TARIFFS_TOOL, decodeTariffsRoot } from './billing/tariffs-root';
import type { IslandSlots, TariffsPlace } from './slots';
import { Form } from './tools/presentation/Form';
import { pageLocale } from './tools/presentation/texts';

const Tariffs = lazy(() => import('./billing/Tariffs').then((module) => ({ default: module.Tariffs })));
const MyPack = lazy(() => import('./billing/MyPack').then((module) => ({ default: module.MyPack })));
const PayReturn = lazy(() => import('./billing/PayReturn').then((module) => ({ default: module.PayReturn })));

/** The photo island's contract (BUILD-PLAN, stream C): PhotoIsland({ locale, slots }). */
interface PhotoIslandModule {
  readonly PhotoIsland: ComponentType<{ readonly locale: StudioLocale; readonly slots: IslandSlots }>;
}
/** Empty while the build has no photo tool: the photo page then keeps its static form. */
const photoIsland = import.meta.glob<PhotoIslandModule>('./tools/photo/Island.tsx');

/** «Mening paketim», once this browser is known to hold or have held a tariff. */
function MyPackSlot({ locale }: { readonly locale: StudioLocale }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (packRemembered()) setShown(true);
    return onPack(() => setShown(true));
  }, []);
  return shown ? (
    <Suspense fallback={null}>
      <MyPack locale={locale} />
    </Suspense>
  ) : null;
}

/** `returning`: the page after payment shows the pack itself, so the tool's slot stays empty. */
function slotsFor(locale: StudioLocale, returning: boolean): IslandSlots {
  return {
    tariffs: (place: TariffsPlace) => (
      <Suspense fallback={null}>
        <Tariffs locale={locale} context={place} />
      </Suspense>
    ),
    myPack: () => (returning ? null : <MyPackSlot locale={locale} />),
  };
}

/** Hydrates the prerendered markup, or renders into an empty root. */
function mount(root: HTMLElement, island: ReactElement): void {
  if (root.firstElementChild) {
    hydrateRoot(root, island, {
      onRecoverableError: () => {
        root.dataset.hydration = 'recovered';
      },
    });
  } else {
    createRoot(root).render(island);
  }
}

/** The tariffs page: the section's chunk first, then the same tree the build wrote. */
function mountTariffsPage(root: HTMLElement, locale: StudioLocale): void {
  const { plans, termsUrl } = decodeTariffsRoot(root.dataset);
  void import('./billing/Tariffs').then(({ Tariffs: Section }) => {
    mount(root, <Section locale={locale} context="page" initialPlans={plans} initialTermsUrl={termsUrl} />);
    root.dataset.island = 'ready';
  });
}

function mountPhoto(root: HTMLElement, locale: StudioLocale, slots: IslandSlots): void {
  const load = photoIsland['./tools/photo/Island.tsx'];
  if (!load) return;
  void load().then(({ PhotoIsland }) => mount(root, <PhotoIsland locale={locale} slots={slots} />));
}

/** The buyer comes back from Payme or Click (?pay=return, lib/studio/checkout.ts studioReturnUrl). */
function payReturning(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('pay') === 'return';
  } catch {
    return false;
  }
}

/** The payment's result in its own box above the tool. */
function mountPayReturn(root: HTMLElement, locale: StudioLocale): void {
  const box = document.createElement('div');
  box.dataset.studioPayReturnBox = '';
  root.before(box);
  createRoot(box).render(
    <Suspense fallback={null}>
      <PayReturn locale={locale} />
    </Suspense>,
  );
}

const root = document.getElementById('studio-root');
if (root) {
  const locale = pageLocale(document.documentElement.lang);
  const returning = payReturning();
  const slots = slotsFor(locale, returning);
  const tool = root.dataset.tool;
  if (tool === TARIFFS_TOOL) mountTariffsPage(root, locale);
  else if (tool === 'photo') mountPhoto(root, locale, slots);
  // Exactly the tree static.ts renders at build time (no StrictMode around it), so the markup matches.
  else mount(root, <Form locale={locale} slots={slots} />);
  if (returning) mountPayReturn(root, locale);
}
