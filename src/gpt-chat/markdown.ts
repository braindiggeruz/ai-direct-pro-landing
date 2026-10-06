import { latexLite } from "./latex-lite";

// Escape before parsing. Only our fixed HTML templates can become elements;
// model HTML, URLs and language labels never become attributes or scripts.
// The one value that reaches an attribute is a list's first number, digits only.
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
              // A link stays text, its address beside it (owner decision 4).
              .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
              .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a?: string, b?: string) => `<strong>${a ?? b}</strong>`)
              .replace(/~~([^~]+)~~/g, "<del>$1</del>")
              // Emphasis only hugs its text: 2 * 3 * 4 stays arithmetic.
              .replace(/(^|[^*])\*([^\s*](?:[^*]*[^\s*])?)\*(?!\*)/g, "$1<em>$2</em>"),
      )
      .join("");
  // Formulas become plain text outside code blocks (latex-lite.ts).
  let fenced = false;
  const prepared = src
    .slice(0, 100_000)
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s*```/.test(line)) fenced = !fenced;
      else if (!fenced) return latexLite(line);
      return line;
    })
    .join("\n");
  const lines = escape(prepared).split("\n").slice(0, 600);
  const out: string[] = [];
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .slice(0, 12)
      .map((v) => v.trim());
  const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  const ordered = (marker: string) => /\d/.test(marker);
  // A list from line `from`, and the line after it. Items at its indent;
  // a deeper item opens a list inside the last item; an indented line that
  // is no item goes on with the last item; across one blank line the list
  // goes on while the next line is one of its items.
  const list = (from: number): [string, number] => {
    const first = item.exec(lines[from])!;
    const indent = first[1].length;
    const numbered = ordered(first[2]);
    const items: string[] = [];
    let i = from;
    while (i < lines.length) {
      const m = item.exec(lines[i]);
      if (m && m[1].length <= indent + 1) {
        if (m[1].length < indent || ordered(m[2]) !== numbered) break;
        items.push(inline(m[3]));
        i++;
      } else if (m) {
        const [nested, next] = list(i);
        items[items.length - 1] += nested;
        i = next;
      } else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && !/^\s*```/.test(lines[i])) {
        items[items.length - 1] += `<br>${inline(lines[i].trim())}`;
        i++;
      } else if (!lines[i].trim()) {
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) j++;
        const m2 = j < lines.length ? item.exec(lines[j]) : null;
        if (!m2 || m2[1].length < indent || (m2[1].length <= indent + 1 && ordered(m2[2]) !== numbered)) break;
        i = j;
      } else break;
    }
    const tag = numbered ? "ol" : "ul";
    const start = numbered ? parseInt(first[2], 10) : 1;
    return [
      `<${tag} class="${numbered ? "list-decimal" : "list-disc"}"${start !== 1 ? ` start="${start}"` : ""}>${items.map((x) => `<li>${x}</li>`).join("")}</${tag}>`,
      i,
    ];
  };
  // Lines next to each other are one paragraph (a poem, a post); a blank line ends it.
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p class="mb-2 last:mb-0">${para.join("<br>")}</p>`);
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i]))
        code.push(lines[i]);
      out.push(
        `<pre class="gpt-code" tabindex="0"><code>${code.join("\n")}</code></pre>`,
      );
    } else if (
      line.includes("|") &&
      i + 1 < lines.length &&
      lines[i + 1].includes("|") &&
      cells(lines[i + 1]).every((c) => /^:?-+:?$/.test(c))
    ) {
      flush();
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
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      out.push('<hr class="my-3 border-white/10">');
    } else if (item.test(line)) {
      flush();
      const [html, next] = list(i);
      out.push(html);
      i = next - 1;
    } else if (/^#{1,6}\s+/.test(line)) {
      flush();
      out.push(`<h3>${inline(line.replace(/^#{1,6}\s+/, ""))}</h3>`);
    } else if (/^\s*&gt;/.test(line)) {
      flush();
      const quote: string[] = [];
      for (; i < lines.length && /^\s*&gt;/.test(lines[i]); i++)
        quote.push(inline(lines[i].replace(/^\s*&gt;\s?/, "")));
      i--;
      out.push(`<blockquote class="border-l-2 border-brand-cyan/25 pl-3 text-white/70">${quote.join("<br>")}</blockquote>`);
    } else if (line.trim()) para.push(inline(line));
    else flush();
  }
  flush();
  return out.join("\n");
}
