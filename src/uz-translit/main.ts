// Entry for the Uzbek Cyrillic ↔ Latin converter on the translator pages.
// A separate Vite entry (vite.config.ts) that scripts/prerender.ts loads only
// on a gpt-chat page with a chatRole, so no other page, the chat bundle
// included, gets heavier. The markup and its messages are prerendered by
// scripts/translator-page.ts; this file only binds the buttons. Everything
// runs in the browser: no request, no analytics event carries the text.
import { normalizeLatin, scriptNotes, toCyrillic, toLatin, type ScriptNote } from '../shared/uz-translit';

type Action = 'latin' | 'cyrillic' | 'normalize' | 'copy';

function bind(root: HTMLElement): void {
  const input = root.querySelector<HTMLTextAreaElement>('#uzt-in');
  const output = root.querySelector<HTMLTextAreaElement>('#uzt-out');
  const status = root.querySelector<HTMLElement>('[data-uzt-status]');
  if (!input || !output || !status) return;
  const message = root.dataset;
  const say = (text: string | undefined) => { status.textContent = text || ''; };
  const noteText = (note: ScriptNote) => (note === 'russian-letters' ? message.msgRussian : message.msgForeign);

  const copy = async () => {
    if (!output.value) { say(message.msgEmpty); return; }
    try {
      await navigator.clipboard.writeText(output.value);
      say(message.msgCopied);
    } catch {
      output.focus();
      output.select();
      say(message.msgCopyFailed);
    }
  };

  root.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button[data-uzt]');
    if (!button || !root.contains(button)) return;
    const action = button.dataset.uzt as Action;
    if (action === 'copy') { void copy(); return; }
    const text = input.value;
    if (!text.trim()) { output.value = ''; say(message.msgEmpty); return; }
    let notes: ScriptNote[] = [];
    if (action === 'latin') {
      output.value = toLatin(text);
      notes = scriptNotes(text, 'latin');
    } else if (action === 'cyrillic') {
      output.value = toCyrillic(text);
      notes = scriptNotes(text, 'cyrillic');
    } else if (action === 'normalize') {
      output.value = normalizeLatin(text);
    } else {
      return;
    }
    say(notes.length ? notes.map(noteText).join(' ') : message.msgDone);
  });
}

function start(): void {
  document.querySelectorAll<HTMLElement>('[data-uz-translit]').forEach(bind);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
