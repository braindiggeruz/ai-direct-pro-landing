// Escaping for the widget blocks under the chat (scripts/tool-widgets.ts):
// every text and attribute value they print comes from build-time copy or
// data, and is still escaped.

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}

/** data-msg-<name>="…" attributes, each with its leading space, for a widget's messages. */
export function messageAttributes(messages: Record<string, string>): string {
  return Object.entries(messages).map(([name, value]) => ` data-msg-${name}="${escapeHtml(value)}"`).join('');
}
