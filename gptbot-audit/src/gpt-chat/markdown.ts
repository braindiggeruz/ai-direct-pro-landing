// Minimal, SAFE markdown → HTML for assistant answers.
// Strategy: escape ALL HTML first, then apply a tiny whitelist of inline
// formatting. No raw HTML from the model is ever rendered — prevents XSS.
export function renderMarkdown(src: string): string {
  const escaped = src.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );

  // Defensive against degenerate model loops (small free models sometimes
  // repeat the same line dozens of times): collapse consecutive identical
  // non-empty lines to one, and hard-cap total lines so a runaway answer can
  // never blow the viewport height.
  const rawLines = escaped.split(/\r?\n/);
  const lines: string[] = [];
  let prevKey = '';
  for (const l of rawLines) {
    const key = l.trim();
    if (key && key === prevKey) continue; // skip consecutive duplicate
    prevKey = key;
    lines.push(l);
    if (lines.length >= 300) break;
  }
  const out: string[] = [];
  let inList = false;

  const inline = (s: string): string =>
    s
      // `code`
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-white/10 text-brand-cyan text-[0.9em]">$1</code>')
      // **bold**
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // *italic* / _italic_
      .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!inList) {
        out.push('<ul class="list-disc pl-5 space-y-1 my-2">');
        inList = true;
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    closeList();
    if (line.trim() === '') {
      out.push('');
    } else {
      out.push(`<p class="mb-2 last:mb-0">${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join('\n');
}
