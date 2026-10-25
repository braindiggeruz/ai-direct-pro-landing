// The chips of an AI tool page (Page.chatStarters): their type, limits and
// checks. One rule set for the build's content gate (chatStarterIssues, with
// messages: scripts/tool-widgets.ts) and the chat (chatStartersAttribute,
// which takes the data-chat-starters list only whole and valid: the lazy part
// src/gpt-chat/parts/chat-tool.ts). Kept out of src/shared/types.ts so the
// chat's start bundle, which imports that file, does not carry it.

/**
 * A prompt chip of an AI tool page (Page.chatStarters): the label on the chip
 * and the plain text it puts into the chat's composer. A chip never sends.
 */
export interface ChatStarter {
  label: string;
  prompt: string;
}
export const CHAT_STARTER_LIMITS = { count: 6, label: 40, prompt: 400 } as const;
/** A control character (C0, DEL, C1, the line and paragraph separators); a line break only where it is not allowed. */
function hasControlCharacter(text: string, lineBreaks: boolean): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 10 && lineBreaks) continue;
    if (code < 32 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) return true;
  }
  return false;
}
/** Markup in a field that must be plain text: a tag, a comment or an entity. */
const STARTER_MARKUP = /<[a-z!/?]|&(?:#\d+|#x[0-9a-f]+|[a-z]+);/i;

type StarterProblem = 'not a string' | 'empty' | 'padded' | 'long' | 'control' | 'markup';
/**
 * The first thing wrong with one field of a chip, or undefined. One rule set
 * for the build's gate (chatStarterIssues, with messages) and the chat's own
 * check (chatStarters, which stays small: it is in the chat's start bundle).
 */
function starterProblem(text: unknown, max: number, lines: boolean): StarterProblem | undefined {
  if (typeof text !== 'string') return 'not a string';
  if (!text.trim()) return 'empty';
  // A prompt may end in one space, so the visitor goes on typing after «…: ».
  if (lines ? text.trimStart() !== text || /\s\s$|\n$/.test(text) : text.trim() !== text) return 'padded';
  if (text.length > max) return 'long';
  if (hasControlCharacter(text, lines)) return 'control';
  if (STARTER_MARKUP.test(text)) return 'markup';
}
const STARTER_PROBLEM: Record<StarterProblem, string> = {
  'not a string': 'is not a string',
  empty: 'is empty',
  padded: 'has leading or trailing spaces',
  long: 'is too long',
  control: 'has a control character or a line break',
  markup: 'has markup; it is plain text',
};

/**
 * What is wrong with a chatStarters value, one line per problem; [] when it
 * is valid. The content gate (scripts/tool-widgets.ts assertToolPage) refuses
 * to render a page with any; src/gpt-chat/main.tsx takes the list only whole
 * (chatStarters, the same rules without the messages).
 */
export function chatStarterIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return ['chatStarters is not an array'];
  const issues: string[] = [];
  const { count, label: labelMax, prompt: promptMax } = CHAT_STARTER_LIMITS;
  if (value.length === 0) issues.push('chatStarters is empty: leave the field out instead');
  if (value.length > count) issues.push(`chatStarters has ${value.length} items, at most ${count}`);
  const labels = new Set<string>();
  value.forEach((item: unknown, index) => {
    const at = `chatStarters[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) { issues.push(`${at} is not an object`); return; }
    const { label, prompt, ...rest } = item as Record<string, unknown>;
    if (Object.keys(rest).length) issues.push(`${at} has unknown fields: ${Object.keys(rest).join(', ')}`);
    for (const [name, text, max, lines] of [['label', label, labelMax, false], ['prompt', prompt, promptMax, true]] as const) {
      const problem = starterProblem(text, max, lines);
      if (problem === 'long') issues.push(`${at}.${name} has ${(text as string).length} characters, at most ${max}`);
      else if (problem) issues.push(`${at}.${name} ${STARTER_PROBLEM[problem]}`);
    }
    if (typeof label === 'string') {
      if (labels.has(label.toLowerCase())) issues.push(`${at}.label repeats another chip`);
      labels.add(label.toLowerCase());
    }
  });
  return issues;
}

/** The starters when the whole value is valid (chatStarterIssues finds nothing), else undefined. */
export function chatStarters(value: unknown): ChatStarter[] | undefined {
  if (!Array.isArray(value) || !value.length || value.length > CHAT_STARTER_LIMITS.count) return;
  const labels = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some((key) => key !== 'label' && key !== 'prompt')) return;
    const { label, prompt } = item as Record<string, unknown>;
    if (starterProblem(label, CHAT_STARTER_LIMITS.label, false) || starterProblem(prompt, CHAT_STARTER_LIMITS.prompt, true) || labels.has((label as string).toLowerCase())) return;
    labels.add((label as string).toLowerCase());
  }
  return value.map(({ label, prompt }) => ({ label, prompt }));
}

/** data-chat-starters as src/gpt-chat/main.tsx reads it: JSON, taken only whole and valid. */
export function chatStartersAttribute(raw: string | undefined): ChatStarter[] | undefined {
  if (!raw || raw.length > 8000) return undefined;
  try {
    return chatStarters(JSON.parse(raw));
  } catch {
    return undefined;
  }
}
