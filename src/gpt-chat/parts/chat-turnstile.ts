// Lazy part chat-turnstile: the security check above the composer. It shows
// only while the server's /api/auth/config asks for it (off in production
// today), so most visitors never download it. Loaded through lazy-part.tsx only.
export { TurnstileChallenge } from '../components/TurnstileChallenge';
