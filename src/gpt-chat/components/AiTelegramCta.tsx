import type { ReactNode } from 'react';
import { track, EV } from '../analytics';
import type { HandoffLink } from '../handoff';

/**
 * The Telegram route out of the chat.
 *
 * The href is resolved before the click (see handoff.ts): the anchor is a real
 * link at all times, so it survives a middle-click, "open in new tab", a
 * popup blocker and a slow network. It is never disabled and never dead —
 * without a minted session link it still opens the verified handle.
 */
export function AiTelegramCta({
  link,
  label,
  stage,
  variant,
  children,
}: {
  link: HandoffLink;
  label: string;
  /** Funnel stage this click belongs to — the GA4 `stage` parameter. */
  stage: string;
  variant: 'primary' | 'secondary';
  children?: ReactNode;
}) {
  // Full width on a phone: a row of differently sized pills is both harder to
  // hit one-handed and visually ragged at 360px.
  const base = 'inline-flex w-full min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base sm:w-auto';
  const skin =
    variant === 'primary'
      ? 'bg-grad-cta text-[#04101A] hover:opacity-95'
      : 'border border-white/12 text-white/80 hover:bg-white/[0.06] hover:text-white';

  return (
    <a
      href={link.href}
      target="_blank"
      rel="nofollow noopener noreferrer"
      data-testid={`telegram-cta-${stage}`}
      onClick={() => {
        track(EV.telegramHandoffClicked, { stage, channel: link.channel, withSession: link.withSession });
        track(EV.telegramCtaClicked, { from: stage, channel: link.channel });
        track(EV.telegramClicked, { from: stage });
        track(EV.telegramClick, { from: stage });
        track(EV.leadIntent, { from: stage });
      }}
      className={`${base} ${skin}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 4L2 11l6 2 2 6 3-4 5 4 4-15z" />
      </svg>
      {label}
      {children}
    </a>
  );
}
