import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BOT_CHAT_URL } from '../lib/bot-link';
import { marketApi, readLaunchTiming } from '../lib/api';
import { formatDate, labelForHandoffReason, labelForHandoffStatus, t } from '../lib/i18n';
import { useBackStop } from '../platform/navigation';
import type { ThemePreference } from '../platform/telegram';
import type { Handoff, Locale, SellerOverview } from '../types';
import {
  Badge,
  ErrorView,
  Icon,
  LoadingView,
  SectionHeader,
  SkeletonList,
  StateView,
} from '../components/ui';
import { BuyerOrdersList } from './BuyerOrders';

const SellerApp = lazy(() => import('./SellerApp').then((module) => ({
  default: module.SellerApp,
})));

type CabinetSection = 'root' | 'orders' | 'store' | 'settings' | 'question';

interface CabinetAppProps {
  locale: Locale;
  /** The person's own first name, shown back to them. Never another user's. */
  userName: string;
  /** The build the server answered from; shown as the app version, nothing else. */
  buildId: string;
  /**
   * Server-granted seller authority. The only thing that decides whether the
   * store section exists — there is no route, parameter or stored preference
   * that can produce it on the client.
   */
  sellerAvailable: boolean;
  sellerCommands: boolean;
  mediaUpload: boolean;
  /**
   * Server-reported cabinet root. A layout switch and nothing else: the same
   * screens, the same authority, a different order of what is offered first.
   */
  homeV2: boolean;
  /**
   * Raised by the create sheet when the person chose "Продать" and the server
   * had already granted the commands. It carries them into the editor that
   * already exists instead of opening a second copy of it here.
   */
  sellIntent: boolean;
  onSellIntentHandled: () => void;
  /** True while an order is half-filled, so the cabinet can say where it left off. */
  activeCheckout: boolean;
  /** True while a question to a seller is still open. */
  activeHandoff: boolean;
  theme: ThemePreference;
  onSearch: () => void;
  /** Opens the shell's create sheet; the cabinet never owns a second one. */
  onCreate: () => void;
  /** Reopens the half-filled order in the shell's own checkout sheet. */
  onResumeCheckout: () => void;
  onTheme: (next: ThemePreference) => void;
  onLocale: (next: Locale) => void;
  /**
   * Raised while the seller workspace is open. That screen carries its own
   * bottom navigation, and two fixed bars cannot share the same edge of a
   * 390 px screen, so the shell hides its own while this is true.
   */
  onWorkspace: (active: boolean) => void;
}

function CabinetRow({
  icon,
  title,
  hint,
  note,
  count,
  onOpen,
}: {
  icon: 'orders' | 'seller' | 'help' | 'settings';
  title: string;
  hint?: string;
  note?: string;
  /** Only ever a number the server actually reported. Never a zero. */
  count?: number;
  onOpen?: () => void;
}) {
  const body = <>
    <span className="cabinet-row__icon"><Icon name={icon} size={20}/></span>
    <span className="cabinet-row__text">
      <strong>{title}</strong>
      {hint ? <small>{hint}</small> : null}
      {note ? <em className="cabinet-row__note">{note}</em> : null}
    </span>
    {count ? <span className="cabinet-row__count">{count}</span> : null}
    {onOpen ? <Icon name="chevron" size={18}/> : null}
  </>;
  return onOpen
    ? <button type="button" className="cabinet-row" onClick={onOpen}>{body}</button>
    : <div className="cabinet-row cabinet-row--static">{body}</div>;
}

function ChoiceRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="cabinet-choice">
      <span className="cabinet-choice__label" id={`choice-${label}`}>{label}</span>
      <div className="segmented segmented--choice" role="group" aria-labelledby={`choice-${label}`}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >{option.label}</button>
        ))}
      </div>
    </div>
  );
}

/** One thing that is genuinely waiting, with the single action that answers it. */
interface AttentionEvent {
  id: 'checkout' | 'question' | 'store';
  tone: 'critical' | 'warning';
  title: string;
  hint: string;
  action: string;
  count?: number;
  onOpen: () => void;
}

function AttentionRow({ event }: { event: AttentionEvent }) {
  return <button
    type="button"
    className={`attention-row attention-row--${event.tone}`}
    onClick={event.onOpen}
  >
    <span className="attention-row__dot" aria-hidden="true" />
    <span className="attention-row__text">
      <strong>{event.title}</strong>
      <small>{event.hint}</small>
    </span>
    {event.count ? <span className="cabinet-row__count">{event.count}</span> : null}
    <Icon name="chevron" size={18} />
  </button>;
}

function BackTo({ label, onBack, children }: {
  label: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return <>
    <button className="buyer-return" onClick={onBack}>
      <Icon name="back" size={17} />{label}
    </button>
    {children}
  </>;
}

/** The buyer's own open question, read from the endpoint that already answers it. */
function QuestionScreen({ locale }: { locale: Locale }) {
  const active = useQuery<{ handoff: Handoff | null }>({
    queryKey: ['handoff-active'],
    queryFn: ({ signal }) => marketApi.get('/handoffs/active', signal),
  });
  if (active.isLoading) return <SkeletonList count={1} />;
  if (active.isError) return <ErrorView locale={locale} retry={() => void active.refetch()} />;
  const handoff = active.data?.handoff ?? null;
  if (!handoff) return <StateView icon="help" title={t(locale, 'questionNone')} />;
  return <div className="stack">
    <div className="row row--between">
      <strong>{labelForHandoffReason(locale, handoff.reason)}</strong>
      <Badge tone={handoff.status === 'open' ? 'warning' : 'positive'}>
        {labelForHandoffStatus(locale, handoff.status)}
      </Badge>
    </div>
    {handoff.questionText
      ? <blockquote className="question-quote">{handoff.questionText}</blockquote>
      : <p className="cabinet-note">{t(locale, 'questionCleared')}</p>}
    {handoff.replyText
      ? <div className="notice"><Icon name="check" size={19}/><span>{handoff.replyText}</span></div>
      : null}
    <p className="cabinet-note">{formatDate(handoff.createdAt, locale)}</p>
  </div>;
}

function LaunchTimingPanel({ locale }: { locale: Locale }) {
  const timing = readLaunchTiming();
  if (!timing) return null;
  return <div className="cabinet-choice">
    <span className="cabinet-choice__label">{t(locale, 'launchTiming')}</span>
    <dl className="timing-list">
      <div>
        <dt>{t(locale, 'timingShelf')}</dt>
        <dd>{timing.totalMs} {t(locale, 'ms')}</dd>
      </div>
      {timing.serverMs !== null ? <div>
        <dt>{t(locale, 'timingServer')}</dt>
        <dd>{timing.serverMs} {t(locale, 'ms')}</dd>
      </div> : null}
      {timing.serverMs !== null ? <div>
        <dt>{t(locale, 'timingNetwork')}</dt>
        <dd>{Math.max(0, timing.totalMs - timing.serverMs)} {t(locale, 'ms')}</dd>
      </div> : null}
      {timing.documentMs !== null ? <div>
        <dt>{t(locale, 'timingDocument')}</dt>
        <dd>{timing.documentMs} {t(locale, 'ms')}</dd>
      </div> : null}
      {timing.scriptsMs !== null ? <div>
        <dt>{t(locale, 'timingScripts')}</dt>
        <dd>{timing.scriptsMs} {t(locale, 'ms')}</dd>
      </div> : null}
    </dl>
    <p className="cabinet-note">{t(locale, 'timingHint')}</p>
  </div>;
}

/**
 * One cabinet for everyone.
 *
 * Grouped by the question being asked rather than by who is asking: what I sent,
 * what I sell, how the app behaves, where to get help. The seller workspace is a
 * section inside it rather than a separate app behind a header toggle, and it is
 * rendered — its chunk not even fetched — only when the server has already said
 * this person owns a store.
 */
export function CabinetApp({
  locale,
  userName,
  buildId,
  sellerAvailable,
  sellerCommands,
  mediaUpload,
  homeV2,
  sellIntent,
  onSellIntentHandled,
  activeCheckout,
  activeHandoff,
  theme,
  onSearch,
  onCreate,
  onResumeCheckout,
  onTheme,
  onLocale,
  onWorkspace,
}: CabinetAppProps) {
  const [section, setSection] = useState<CabinetSection>(
    sellIntent && sellerAvailable && sellerCommands ? 'store' : 'root',
  );
  // Latched rather than read straight from the prop: the workspace chunk is
  // fetched lazily, and the intent is answered before it finishes arriving. A
  // prop would already be back to false by the time the editor mounted.
  const [pendingEditor, setPendingEditor] = useState(
    () => Boolean(sellIntent && sellerAvailable && sellerCommands),
  );
  // The sell intent arrives as a prop change while this screen is already on
  // stage — pressing "Продать" from the cabinet's own empty state never unmounts
  // it. Answered during the render that receives it rather than in an effect
  // afterwards, so the workspace is what paints instead of the root painting
  // once and being replaced a frame later.
  const [answeredIntent, setAnsweredIntent] = useState(sellIntent);
  if (sellIntent !== answeredIntent) {
    setAnsweredIntent(sellIntent);
    if (sellIntent && sellerAvailable && sellerCommands) {
      setPendingEditor(true);
      setSection('store');
    }
  }

  const workspace = section === 'store' && sellerAvailable;
  const leaveWorkspace = () => {
    setPendingEditor(false);
    setSection('root');
  };
  // Anything below the cabinet root is one level deep, so a back gesture takes
  // the person up to the root instead of out of the app. The workspace uses the
  // same exit the visible control does, so the two cannot disagree.
  useBackStop(section !== 'root', `cabinet:${section}`, () => {
    if (workspace) leaveWorkspace();
    else setSection('root');
  });

  // The same query key the workspace itself uses, so opening the cabinet warms
  // the screen it leads to instead of paying for a second read. Only asked for
  // when the server has already granted the authority, and never at launch.
  const overview = useQuery<SellerOverview>({
    queryKey: ['seller-overview'],
    queryFn: ({ signal }) => marketApi.get('/seller/overview', signal),
    enabled: homeV2 && sellerAvailable && section === 'root',
    staleTime: 15_000,
  });

  useEffect(() => {
    onWorkspace(workspace);
    return () => onWorkspace(false);
  }, [workspace, onWorkspace]);

  // The acknowledgement is the only part that belongs after the paint: it lowers
  // a flag the shell raised. An intent this person cannot act on is still spent
  // here, so a granted authority later does not open an editor nobody asked for.
  useEffect(() => {
    if (!sellIntent) return;
    onSellIntentHandled();
  }, [sellIntent, onSellIntentHandled]);

  if (workspace) {
    return <Suspense fallback={<LoadingView locale={locale} />}>
      <SellerApp
        locale={locale}
        commands={sellerCommands}
        mediaUpload={mediaUpload}
        startEditor={pendingEditor}
        onBuyer={leaveWorkspace}
        returnLabel={t(locale, 'cabinet')}
      />
    </Suspense>;
  }

  if (section === 'orders') {
    return <BackTo label={t(locale, 'cabinet')} onBack={() => setSection('root')}>
      <section className="hero"><h1>{t(locale, 'myOrders')}</h1></section>
      <BuyerOrdersList locale={locale} onSearch={onSearch} />
    </BackTo>;
  }

  if (section === 'question') {
    return <BackTo label={t(locale, 'cabinet')} onBack={() => setSection('root')}>
      <section className="hero"><h1>{t(locale, 'myQuestion')}</h1></section>
      <section className="section"><QuestionScreen locale={locale} /></section>
    </BackTo>;
  }

  if (section === 'settings') {
    return <BackTo label={t(locale, 'cabinet')} onBack={() => setSection('root')}>
      <section className="hero"><h1>{t(locale, 'settingsAndHelp')}</h1></section>
      <section className="section">
        <SectionHeader title={t(locale, 'settings')} />
        <div className="cabinet-list">
          <ChoiceRow
            label={t(locale, 'language')}
            value={locale}
            options={[
              { value: 'ru' as Locale, label: 'Русский' },
              { value: 'uz' as Locale, label: 'O‘zbekcha' },
            ]}
            onChange={onLocale}
          />
          <ChoiceRow
            label={t(locale, 'theme')}
            value={theme}
            options={[
              { value: 'auto' as ThemePreference, label: t(locale, 'themeAuto') },
              { value: 'light' as ThemePreference, label: t(locale, 'themeLight') },
              { value: 'dark' as ThemePreference, label: t(locale, 'themeDark') },
            ]}
            onChange={onTheme}
          />
          <p className="cabinet-note">{t(locale, 'themeHint')}</p>
        </div>
      </section>
      <section className="section">
        <SectionHeader title={t(locale, 'helpTitle')} />
        <div className="cabinet-list">
          {BOT_CHAT_URL ? <a
            className="cabinet-row"
            href={BOT_CHAT_URL}
            target="_blank"
            rel="noreferrer"
          >
            <span className="cabinet-row__icon"><Icon name="help" size={20}/></span>
            <span className="cabinet-row__text">
              <strong>{t(locale, 'helpTitle')}</strong>
              <small>{t(locale, 'helpBody')}</small>
            </span>
            <Icon name="chevron" size={18}/>
          </a> : null}
          <LaunchTimingPanel locale={locale} />
          <div className="cabinet-choice">
            <span className="cabinet-choice__label">{t(locale, 'appVersion')}</span>
            <p className="cabinet-note">{buildId}</p>
          </div>
        </div>
      </section>
    </BackTo>;
  }

  if (!homeV2) {
    return <>
      <section className="hero"><h1>{t(locale, 'cabinet')}</h1></section>
      <section className="section">
        <div className="cabinet-profile">
          <span className="cabinet-profile__avatar" aria-hidden="true"><Icon name="cabinet" size={24}/></span>
          <span className="cabinet-profile__text">
            <strong>{userName}</strong>
            <small>{t(locale, sellerAvailable ? 'roleBuyerSeller' : 'roleBuyer')}</small>
          </span>
        </div>
      </section>

      <section className="section">
        <SectionHeader title={t(locale, 'myActivity')} />
        <div className="cabinet-list">
          <CabinetRow
            icon="orders"
            title={t(locale, 'myOrders')}
            hint={t(locale, 'myOrdersHint')}
            note={activeCheckout
              ? t(locale, 'checkoutUnfinished')
              : activeHandoff ? t(locale, 'questionWaiting') : undefined}
            onOpen={() => setSection('orders')}
          />
        </div>
      </section>

      {sellerAvailable ? <section className="section">
        <SectionHeader title={t(locale, 'store')} />
        <div className="cabinet-list">
          <CabinetRow
            icon="seller"
            title={t(locale, 'storeWorkspace')}
            hint={t(locale, 'storeHint')}
            onOpen={() => setSection('store')}
          />
        </div>
      </section> : null}

      <section className="section">
        <SectionHeader title={t(locale, 'settings')} />
        <div className="cabinet-list">
          <ChoiceRow
            label={t(locale, 'language')}
            value={locale}
            options={[
              { value: 'ru' as Locale, label: 'Русский' },
              { value: 'uz' as Locale, label: 'O‘zbekcha' },
            ]}
            onChange={onLocale}
          />
          <ChoiceRow
            label={t(locale, 'theme')}
            value={theme}
            options={[
              { value: 'auto' as ThemePreference, label: t(locale, 'themeAuto') },
              { value: 'light' as ThemePreference, label: t(locale, 'themeLight') },
              { value: 'dark' as ThemePreference, label: t(locale, 'themeDark') },
            ]}
            onChange={onTheme}
          />
          <p className="cabinet-note">{t(locale, 'themeHint')}</p>
        </div>
      </section>

      <section className="section">
        <SectionHeader title={t(locale, 'helpTitle')} />
        <div className="cabinet-list">
          <CabinetRow
            icon="help"
            title={t(locale, 'helpTitle')}
            hint={t(locale, 'helpBody')}
          />
          <LaunchTimingPanel locale={locale} />
        </div>
      </section>
    </>;
  }

  // ── Cabinet home v2 ────────────────────────────────────────────────────────
  //
  // What waits, then what you have, then everything else. A block with nothing
  // behind it is not rendered at all: an empty "Требует внимания" card would be
  // decoration, and a counter of zero would be a claim the server never made.
  const storeTasks = sellerAvailable ? storeAttentionTotal(overview.data) : 0;
  const events: AttentionEvent[] = [];
  if (activeCheckout) {
    events.push({
      id: 'checkout',
      tone: 'critical',
      title: t(locale, 'attentionCheckout'),
      hint: t(locale, 'attentionCheckoutHint'),
      action: t(locale, 'resumeCheckout'),
      onOpen: onResumeCheckout,
    });
  }
  if (activeHandoff) {
    events.push({
      id: 'question',
      tone: 'warning',
      title: t(locale, 'attentionQuestion'),
      hint: t(locale, 'attentionQuestionHint'),
      action: t(locale, 'openQuestion'),
      onOpen: () => setSection('question'),
    });
  }
  if (storeTasks > 0) {
    events.push({
      id: 'store',
      tone: 'warning',
      title: t(locale, 'store'),
      hint: t(locale, 'storeTasks'),
      action: t(locale, 'openSection'),
      count: storeTasks,
      onOpen: () => setSection('store'),
    });
  }

  // Every event that is waiting is named in the block — a button reading
  // «Открыть вопрос» under a list that never mentions a question is an action
  // with no referent. The most urgent personal one is additionally raised to the
  // single primary action, which is the answer to the row directly above it.
  // Store housekeeping never takes that slot: it is work, not something the
  // shopper has to answer.
  const primary = events[0]?.id === 'store' ? undefined : events[0];
  const rows = events.slice(0, 3);

  return <>
    <section className="cabinet-identity">
      <span className="cabinet-identity__avatar" aria-hidden="true">
        <Icon name="cabinet" size={22}/>
      </span>
      <span className="cabinet-identity__text">
        <strong>{userName || t(locale, 'cabinetFallbackName')}</strong>
        {sellerAvailable && overview.data?.store.name
          ? <small>{overview.data.store.name}</small>
          : null}
      </span>
    </section>

    {rows.length ? <section className="section">
      <SectionHeader title={t(locale, 'attentionTitle')} />
      <div className="attention-list">
        {rows.map((event) => <AttentionRow key={event.id} event={event} />)}
      </div>
    </section> : null}

    {primary ? <div className="cabinet-primary">
      <button type="button" className="button button--primary button--wide" onClick={primary.onOpen}>
        {primary.action}
      </button>
    </div> : null}

    {!events.length ? <div className="cabinet-primary">
      <button type="button" className="button button--primary button--wide" onClick={onCreate}>
        <Icon name="plus" size={19} />{t(locale, 'postAdCta')}
      </button>
    </div> : null}

    <section className="section">
      <div className="cabinet-list">
        <CabinetRow
          icon="orders"
          title={t(locale, 'myOrders')}
          hint={t(locale, 'myOrdersHint')}
          onOpen={() => setSection('orders')}
        />
        {sellerAvailable ? <CabinetRow
          icon="seller"
          title={t(locale, 'store')}
          hint={t(locale, 'storeHint')}
          count={storeTasks || undefined}
          onOpen={() => setSection('store')}
        /> : null}
        <CabinetRow
          icon="settings"
          title={t(locale, 'settingsAndHelp')}
          hint={t(locale, 'settingsAndHelpHint')}
          onOpen={() => setSection('settings')}
        />
      </div>
    </section>

    {!events.length
      ? <p className="cabinet-empty">{t(locale, 'emptyCabinet')}</p>
      : null}
  </>;
}

/**
 * How much of the store's own work is outstanding.
 *
 * Every group already arrives as `{ count, truncated }` from `/seller/overview`,
 * so this is a sum of numbers the server computed — never a client guess, and
 * never rendered when it is zero.
 */
function storeAttentionTotal(overview: SellerOverview | undefined): number {
  if (!overview) return 0;
  const { attention } = overview;
  return attention.newOrders.count
    + attention.agingOrders.count
    + attention.openQuestions.count
    + attention.outOfStock.count
    + attention.drafts.count
    + attention.weakProducts.count;
}
