// Lazy part chat-limit: the limit card's Telegram route (the assistant bot and
// its handoff link). It shows only while the server's account view says
// botHandoff, so most visitors never download it; the card itself, its words
// and its pack button are on the start bundle (limit-card.ts). Loaded through
// lazy-part.tsx only.
export { AiLimitTelegram } from '../components/AiLimitTelegram';
