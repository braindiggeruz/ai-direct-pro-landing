// Lazy part chat-answer: how an answer reads (Markdown) and its action row.
// The console fetches it once a question is being written or a conversation
// is on screen; until it is here an answer shows as plain text. Loaded
// through lazy-part.tsx only.
export { AnswerBody, MessageActions } from '../components/AiAnswer';
