// Lazy part chat-account: the pack window's body and its copy. Loaded through
// lazy-part.tsx only; a static import from the start would put it back on
// every visitor's first load (scripts/chat-bundle-budget.ts fails on that).
export { AiAccountWindow } from '../components/AiAccountWindow';
