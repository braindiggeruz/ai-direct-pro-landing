import type { ChatStrings } from '../i18n';
import type { Locale } from '../types';
import { useTelegramHandoff, type HandoffSource } from '../handoff';
import { AiTelegramCta } from './AiTelegramCta';

export type LimitCardReason = 'hourly' | 'daily' | 'monthly';

const SOURCE: Record<LimitCardReason, HandoffSource> = {
  hourly: 'hourly_limit',
  daily: 'daily_limit',
  monthly: 'monthly_limit',
};

/**
 * The Telegram route on the limit card AiChatConsole renders when a cap is
 * hit: the assistant bot, which drafts a reply to a forwarded message and has
 * its own separate allowance. The copy says so, and does not promise to
 * continue this chat there (HANDOFF_WELCOME, the bot's greeting, agrees).
 *
 * Mount this only while the limit card is on screen — the handoff hook mints
 * a single-use link (one D1 row) per mount, and the per-IP minting budget is
 * shared by everybody behind the same carrier NAT. Before the mint answers,
 * and whenever it fails, the anchor already holds the public bot link, so a
 * tap never lands on a personal account (handoff.ts).
 *
 * Copy follows the destination, never the other way round: the "reply in
 * the bot" label and the note about what the bot does only when the
 * link goes to the bot; the "this conversation travels with you" line only
 * when the server confirmed that it does.
 */
export function AiLimitTelegram({
  t,
  locale,
  apiBase,
  sessionId,
  reason,
  variant,
}: {
  t: ChatStrings;
  locale: Locale;
  apiBase: string;
  sessionId: string | null;
  reason: LimitCardReason;
  variant: 'primary' | 'secondary';
}) {
  const source = SOURCE[reason];
  const link = useTelegramHandoff(apiBase, sessionId, locale, source);
  const toBot = link.channel === 'bot';
  return (
    <div data-testid="ai-limit-telegram" data-channel={link.channel}>
      <AiTelegramCta
        link={link}
        label={toBot ? t.capTelegramCta : t.contactTelegram}
        stage={source}
        variant={variant}
      />
      {toBot && <p className="mt-2 text-[12px] leading-relaxed text-white/45">{t.capTelegramNote}</p>}
      {link.withSession && (
        <p className="mt-1 text-[12px] leading-relaxed text-white/45">{t.telegramContextNote}</p>
      )}
    </div>
  );
}
