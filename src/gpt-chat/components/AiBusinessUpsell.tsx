import type { ChatStrings } from '../i18n';
import { track, EV } from '../analytics';

// Soft B2B card shown after a few useful messages. Drives leads to the
// existing GPTBot.uz money pages. Dismissible, non-intrusive.
export function AiBusinessUpsell({ t, onDismiss }: { t: ChatStrings; onDismiss: () => void }) {
  const go = (where: string, href: string) => {
    track(EV.leadIntent, { from: 'b2b_card', where });
    track(EV.b2bCtaClicked, { from: 'b2b_card', where });
    window.location.href = href;
  };
  return (
    <div
      className="relative rounded-2xl p-4 sm:p-5 msg-in"
      style={{ background: 'linear-gradient(135deg, rgba(34,158,217,0.08), rgba(110,59,255,0.06))' }}
      role="complementary"
      data-testid="ai-b2b-card"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Скрыть"
        className="absolute top-1.5 right-1.5 grid h-11 w-11 place-items-center rounded-xl text-white/45 hover:text-white hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan text-sm"
      >
        ✕
      </button>
      <p className="text-white font-medium pr-6 mb-3 leading-snug">{t.b2bTitle}</p>
      <div className="flex flex-wrap gap-2">
        <a href="https://t.me/XGame_changerx" onClick={() => { track(EV.leadIntent, { from: 'b2b_card', where: 'discuss' }); track(EV.telegramClick, { from: 'b2b_card' }); track(EV.b2bCtaClicked, { from: 'b2b_card', where: 'discuss' }); track(EV.telegramClicked, { from: 'b2b_card' }); }} rel="nofollow noopener noreferrer" target="_blank" className="btn-primary text-[13px] px-4 py-2.5 min-h-12">
          {t.b2bDiscuss}
        </a>
        <button type="button" onClick={() => go('site_chat', '/ru/ai-chat-dlya-sayta/')} className="btn-secondary text-[13px] px-4 py-2.5">
          {t.b2bSiteChat}
        </button>
        <button type="button" onClick={() => go('telegram', '/ru/razrabotka-telegram-bota-tashkent/')} className="btn-secondary text-[13px] px-4 py-2.5">
          {t.b2bTelegram}
        </button>
      </div>
    </div>
  );
}
