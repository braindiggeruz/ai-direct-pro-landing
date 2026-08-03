import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMedia } from '../lib/api';
import { DEMO_PRODUCT_PREVIEW, demoPreviewName } from '../lib/demo-product-media';
import { formatPrice, t } from '../lib/i18n';
import type { Locale } from '../types';

export type IconName =
  | 'home' | 'search' | 'compare' | 'orders' | 'seller' | 'back'
  | 'filter' | 'close' | 'box' | 'help' | 'inventory' | 'products'
  | 'check' | 'warning' | 'plus' | 'edit' | 'refresh' | 'chevron'
  | 'spark' | 'mic' | 'stop' | 'cabinet' | 'heart'
  | 'sun' | 'moon' | 'contrast';

const paths: Record<IconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  compare: <><path d="M7 3v18M17 3v18"/><path d="m3 7 4-4 4 4M13 17l4 4 4-4"/></>,
  orders: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></>,
  seller: <><path d="M4 9h16l-2-6H6z"/><path d="M5 9v11h14V9M9 20v-6h6v6"/></>,
  back: <path d="m15 18-6-6 6-6"/>,
  filter: <path d="M4 6h16M7 12h10M10 18h4"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  box: <><path d="m4 7 8-4 8 4-8 4z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.7 2.2c-.8.4-1.2.9-1.2 1.8M12 17h.01"/></>,
  inventory: <><path d="M4 5h16v4H4zM6 9v11h12V9"/><path d="M10 13h4"/></>,
  products: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  warning: <><path d="M12 3 2.5 20h19z"/><path d="M12 9v4M12 17h.01"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  edit: <><path d="m4 20 4-1 10-10-3-3L5 16z"/><path d="m13 7 3 3"/></>,
  refresh: <><path d="M20 7v5h-5"/><path d="M18 16a8 8 0 1 1 1-8l1 4"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  spark: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4z"/><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3M9 21h6"/></>,
  stop: <rect x="7" y="7" width="10" height="10" rx="2.5"/>,
  cabinet: <><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></>,
  heart: <path d="M12 20S4 14.6 4 9.6A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 8 2c0 5-8 10.4-8 10.4z"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></>,
  moon: <path d="M20 13.4A8 8 0 1 1 10.6 4a6.4 6.4 0 0 0 9.4 9.4z"/>,
  // Half-filled disc: the app takes whichever side Telegram is on.
  contrast: <><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/></>,
};

export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <img
      className="brand-mark"
      src="/assets/brand/bormi-mark.svg"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="sync"
    />
  );
}

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function Button({
  variant = 'primary',
  wide,
  pending,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  wide?: boolean;
  pending?: boolean;
}) {
  return (
    <button
      {...props}
      className={`button button--${variant}${wide ? ' button--wide' : ''}${props.className ? ` ${props.className}` : ''}`}
      disabled={pending || props.disabled}
      aria-busy={pending || undefined}
    >
      {pending ? <span className="spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Badge({ tone = 'neutral', children }: PropsWithChildren<{
  tone?: 'positive' | 'warning' | 'negative' | 'neutral' | 'info';
}>) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function AsyncImage({
  handle,
  alt,
  className = '',
  previewSrc,
  eager = false,
}: {
  handle?: string;
  alt: string;
  className?: string;
  previewSrc?: string;
  eager?: boolean;
}) {
  const query = useQuery({
    queryKey: ['media', handle],
    queryFn: ({ signal }) => fetchMedia(handle!, signal),
    enabled: Boolean(handle) && !previewSrc,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
  useEffect(() => {
    const value = query.data;
    return () => {
      if (value?.startsWith('blob:')) URL.revokeObjectURL(value);
    };
  }, [query.data]);
  if (previewSrc) {
    return <img
      className={className}
      src={previewSrc}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : 'auto'}
      decoding="async"
    />;
  }
  if (!handle || query.isError) {
    return <div className={`image-fallback ${className}`} role="img" aria-label={alt}><Icon name="box" size={32} /></div>;
  }
  if (!query.data) return <div className={`skeleton media-skeleton ${className}`} aria-hidden="true" />;
  return <img className={className} src={query.data} alt={alt} loading="lazy" decoding="async" />;
}

export function StateView({
  icon = 'warning', title, body, action,
}: { icon?: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <section className="state-view" role="status" aria-live="polite">
      <span className="state-view__icon"><Icon name={icon} size={28} /></span>
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
      {action ? <div>{action}</div> : null}
    </section>
  );
}

export function LoadingView({ locale }: { locale: Locale }) {
  return (
    <main className="launch-preview" aria-busy="true">
      <header className="launch-preview__header">
        <BrandMark size={44} />
        <div className="brand-lockup"><strong>{t(locale, 'appName')}</strong><span>{t(locale, 'brandPromise')}</span></div>
        <span className="spinner" aria-hidden="true" />
      </header>
      <section className="launch-preview__hero" role="status" aria-live="polite">
        <span className="eyebrow">{t(locale, 'loading')}</span>
        <h1>{t(locale, 'brandPromise')}</h1>
        <p>{t(locale, 'loadingBody')}</p>
      </section>
      <div className="launch-preview__grid" aria-hidden="true">
        {DEMO_PRODUCT_PREVIEW.map((item, index) => <article className="product-card" key={item.image}>
          <img className="product-card__media" src={item.image} alt="" loading={index < 2 ? 'eager' : 'lazy'} fetchPriority={index < 2 ? 'high' : 'auto'} />
          <div className="product-card__body">
            <strong>{demoPreviewName(item, locale)}</strong>
            <span className="product-card__price">{formatPrice(item.priceMinor, locale)}</span>
            <span className="skeleton launch-preview__action" />
          </div>
        </article>)}
      </div>
    </main>
  );
}

export function Modal({
  open, title, onClose, closeLabel, children, sheet = false,
}: PropsWithChildren<{
  open: boolean; title: string; onClose: () => void; closeLabel: string; sheet?: boolean;
}>) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      before?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        ref={dialogRef}
        className={sheet ? 'modal modal--sheet' : 'modal'}
        role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
      >
        {sheet ? <span className="modal__handle" aria-hidden="true" /> : null}
        <header className="modal__header">
          <h2 id={titleId}>{title}</h2>
          <button ref={closeRef} className="icon-button" onClick={onClose} aria-label={closeLabel}>
            <Icon name="close" />
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </section>
    </div>
  );
}

export function Field({
  label, hint, error, children,
}: PropsWithChildren<{ label: string; hint?: string; error?: string }>) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {error ? <span className="field__error" role="alert">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return <header className="section-header"><h2>{title}</h2>{action}</header>;
}

export function ErrorView({ locale, retry }: { locale: Locale; retry?: () => void }) {
  return <StateView title={t(locale, 'errorTitle')} body={t(locale, 'errorBody')} action={retry ? <Button variant="secondary" onClick={retry}><Icon name="refresh" />{t(locale, 'retry')}</Button> : null} />;
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return <div className="product-grid" aria-hidden="true">{Array.from({ length: count }, (_, index) => <div className="product-card" key={index}><div className="skeleton product-card__media"/><div className="skeleton skeleton-line"/><div className="skeleton skeleton-line skeleton-line--short"/></div>)}</div>;
}
