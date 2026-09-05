// Escape before parsing. Only our fixed HTML templates can become elements;
// model HTML, URLs and language labels never become attributes or scripts.
export function renderMarkdown(src: string): string {
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  const inline = (s: string): string =>
    s
      .split(/(`[^`]*`)/g)
      .map((part) =>
        part.startsWith("`")
          ? `<code class="px-1 py-0.5 rounded bg-white/10 text-brand-cyan">${part.slice(1, -1)}</code>`
          : part
              .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
              .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>"),
      )
      .join("");
  const lines = escape(src.slice(0, 100_000)).split(/\r?\n/).slice(0, 600);
  const out: string[] = [];
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .slice(0, 12)
      .map((v) => v.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      const code: string[] = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i]))
        code.push(lines[i]);
      out.push(
        `<pre class="gpt-code" tabindex="0"><code>${code.join("\n")}</code></pre>`,
      );
    } else if (
      line.includes("|") &&
      i + 1 < lines.length &&
      cells(lines[i + 1]).every((c) => /^:?-{3,}:?$/.test(c))
    ) {
      const head = cells(line);
      i++;
      const rows: string[] = [];
      while (i + 1 < lines.length && lines[i + 1].includes("|"))
        rows.push(
          `<tr>${cells(lines[++i])
            .map((c) => `<td>${inline(c)}</td>`)
            .join("")}</tr>`,
        );
      out.push(
        `<div class="gpt-table-scroll" tabindex="0"><table><thead><tr>${head.map((c) => `<th scope="col">${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`,
      );
    } else if (/^\s*(?:[-*]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const tag = ordered ? "ol" : "ul";
      const items: string[] = [];
      const pattern = ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
      do {
        items.push(`<li>${inline(pattern.exec(lines[i])![1])}</li>`);
        i++;
      } while (i < lines.length && pattern.test(lines[i]));
      i--;
      out.push(
        `<${tag} class="${ordered ? "list-decimal" : "list-disc"}">${items.join("")}</${tag}>`,
      );
    } else if (/^#{1,6}\s+/.test(line))
      out.push(`<h3>${inline(line.replace(/^#{1,6}\s+/, ""))}</h3>`);
    else if (line.trim())
      out.push(`<p class="mb-2 last:mb-0">${inline(line)}</p>`);
  }
  return out.join("\n");
}
