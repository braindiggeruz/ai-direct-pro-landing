import { latexLite, mathHtml } from "./latex-lite";

/** A display formula: $$…$$ or \[…\], over one line or several. */
const MATH_OPEN = /^\s*(\$\$|\\\[)(.*)$/;
/** A line that is one inline formula alone, \(…\), reads as a display formula too. */
const MATH_LINE = /^\s*\\\(((?:(?!\\\().)*)\\\)\s*$/;
/** How far a display formula may run before its opener counts as text (an answer still arriving may end inside one). */
const MATH_MAX_LINES = 30;
/** A step heading (chat design §5.5): «1. …», «1) …», «1-qadam …», «Шаг 1 …», «1-шаг …». */
const STEP = /^(?:(\d{1,2})[.)]\s+|(\d{1,2})-(?:qadam|шаг)(?=[\s.:)]|$)[.:)]?\s*|(?:Шаг|Qadam)\s+(\d{1,2})(?=[\s.:)]|$)[.:)]?\s*)/i;
/** The answer box and the check line: a paragraph that starts with its word (optionally bold, after ✅). */
const RESULT = /^(?:✅\s*)?(<strong>)?\s*(javob|ответ)\s*(<\/strong>)?\s*:\s*(<\/strong>)?\s*/i;
const CHECK = /^(?:✅\s*)?(?:<strong>)?\s*(?:tekshirish|tekshiramiz|проверка)\s*(?:<\/strong>)?\s*:/i;
/** What a display formula never holds: where the opener of an answer still arriving was left unclosed. */
const FORMULA_END = /^\s*(?:$|```|#{1,6}\s|[-*+]\s|\d+[.)]\s)/;
/** The answer box holds a short value (a number, an equation, a few words), never a letter that starts with «Ответ:». */
const RESULT_MAX = 80;

// Escape before parsing. Only our fixed HTML templates can become elements;
// model HTML, URLs and language labels never become attributes or scripts.
// The values that reach an attribute are a list's first number and the
// counter it starts from, digits only. `copy`, the label of a code block's
// own copy button (REV-6), is ours. `streaming`: the answer is still
// arriving, so a display formula it opened may not be closed yet.
export function renderMarkdown(src: string, copy?: string, streaming = false): string {
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
  // Display formulas, drawn before the rest is escaped and parsed; each
  // stands in the text as a marker line («\uE000N\uE000», a private-use character) that nothing
  // else matches.
  const formulas: string[] = [];
  const formula = (rows: string[]) => {
    // One row per source line or «\\»; an aligned block's environment and «&» go.
    formulas.push(rows.join("\n").replace(/\\(?:begin|end)\{[a-z*]+\}|&/g, "").split(/\n|\\\\/)
      .filter((row) => row.trim()).map((row) => `<div>${mathHtml(escape(row.trim()))}</div>`).join(""));
    return `\uE000${formulas.length - 1}\uE000`;
  };
  const marked = (s: string) => s.replace(/\uE000(\d+)\uE000/g, (_, n: string) => `<div class="gpt-math" tabindex="0">${formulas[Number(n)]}</div>`);
  const inline = (s: string): string =>
    marked(s
      .split(/(`[^`]*`)/g)
      .map((part) =>
        part.startsWith("`")
          ? `<code class="px-1 py-0.5 rounded bg-white/10 text-brand-cyan">${part.slice(1, -1)}</code>`
          : part
              // A link stays text, its address beside it (owner decision 4).
              // Bounded, so a line of unclosed «[» stays linear on every frame.
              .replace(/\[([^[\]\n]{1,300})\]\(([^()\s]{1,2000}(?:\([^()\s]{0,200}\)[^()\s]{0,200})?)\)/g, "$1 ($2)")
              .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a?: string, b?: string) => `<strong>${a ?? b}</strong>`)
              .replace(/~~([^~]+)~~/g, "<del>$1</del>")
              // Emphasis only hugs its text: 2 * 3 * 4 stays arithmetic.
              .replace(/(^|[^*])\*([^\s*](?:[^*]*[^\s*])?)\*(?!\*)/g, "$1<em>$2</em>"),
      )
      .join(""));
  // Formulas become plain text outside code blocks (latex-lite.ts), except
  // display formulas, which are drawn.
  let fenced = false;
  const source = src.slice(0, 100_000).replace(/\uE000/g, "").split(/\r?\n/);
  const prepared: string[] = [];
  for (let i = 0; i < source.length; i++) {
    const line = source[i];
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced || /^\s*```/.test(line)) {
      prepared.push(line);
      continue;
    }
    const indent = /^\s*/.exec(line)![0];
    const open = MATH_OPEN.exec(line);
    if (open) {
      const close = open[1] === "$$" ? "$$" : "\\]";
      const rest = open[2];
      const end = rest.indexOf(close);
      if (end >= 0 && !rest.slice(end + close.length).trim()) {
        prepared.push(indent + formula([rest.slice(0, end)]));
        continue;
      }
      if (end < 0) {
        let j = i + 1;
        while (j < source.length && j - i <= MATH_MAX_LINES && !source[j].includes(close)) j++;
        if (j < source.length && j - i <= MATH_MAX_LINES && !source[j].slice(source[j].indexOf(close) + close.length).trim()) {
          prepared.push(indent + formula([rest, ...source.slice(i + 1, j), source[j].slice(0, source[j].indexOf(close))]));
          i = j;
          continue;
        }
        // The end of an answer still arriving: what came so far is the formula,
        // unless a blank line, a fence, a heading or a list item came after the
        // opener. A finished answer's opener without a closer is text.
        if (streaming && j >= source.length && !source.slice(i + 1).some((next) => FORMULA_END.test(next))) {
          prepared.push(indent + formula([rest, ...source.slice(i + 1)]));
          break;
        }
      }
    }
    const alone = MATH_LINE.exec(line);
    prepared.push(alone ? indent + formula([alone[1]]) : latexLite(line));
  }
  const lines = escape(prepared.join("\n")).split("\n").slice(0, 600);
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
    // A numbered list counts its steps in circles from its own first number
    // (premium.css): a list split by a paragraph goes on 2, 3, not 1 again.
    return [
      `<${tag} class="${numbered ? "list-decimal" : "list-disc"}"${start !== 1 ? ` start="${start}" style="counter-reset:step ${start - 1}"` : ""}>${items.map((x) => `<li>${x}</li>`).join("")}</${tag}>`,
      i,
    ];
  };
  // Lines next to each other are one paragraph (a poem, a post); a blank line
  // ends it. «Javob:» opens the answer box, «Tekshirish:» the check line; a
  // line that starts with either starts a block of its own.
  let para: string[] = [];
  const paragraph = (rows: string[]) => {
    const text = rows.join("<br>");
    // One text block beside the tick: bold, code and line breaks stay inside it.
    out.push(CHECK.test(text) ? `<p class="gpt-check-line"><span>${text}</span></p>` : `<p class="mb-2 last:mb-0">${text}</p>`);
  };
  const block = (rows: string[]) => {
    const result = RESULT.exec(rows[0]);
    if (!result) return paragraph(rows);
    // The box holds its own line's value («**Javob:**» alone: the next line's);
    // the lines after it are a paragraph.
    let value = rows[0].slice(result[0].length);
    let rest = rows.slice(1);
    if (!value.trim() && rest.length) [value, rest] = [rest[0], rest.slice(1)];
    // «**Javob: x = 3**»: the bold that opened before the word goes on in the value.
    if (result[1] && !result[3] && !result[4]) value = `<strong>${value}`;
    const plain = value.replace(/<[^>]*>/g, "").trim();
    const short = plain.length > 0 && plain.length <= RESULT_MAX
      && (/[\d=±√≈≠≤≥×÷π∞]|&[lg]t;/.test(plain) || (plain.split(/\s+/).length <= 3 && !/[,;!?]|\.(?!$)/.test(plain)));
    if (!short) return paragraph(rows);
    // x_1, x_{1,2}: the roots the box names read with their indices lowered.
    value = value.replace(/([A-Za-z])_\{?(\d{1,2}(?:,\d{1,2})?)\}?/g, "$1<sub>$2</sub>");
    const word = result[2];
    out.push(`<div class="gpt-result"><span class="gpt-result-label">${word[0].toUpperCase()}${word.slice(1).toLowerCase()}</span><span class="gpt-result-value">${value}</span></div>`);
    if (rest.length) paragraph(rest);
  };
  const flush = () => {
    let rows: string[] = [];
    for (const row of para) {
      if (rows.length && (RESULT.test(row) || CHECK.test(row))) {
        block(rows);
        rows = [];
      }
      rows.push(row);
    }
    if (rows.length) block(rows);
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\uE000\d+\uE000\s*$/.test(line)) {
      flush();
      out.push(marked(line.trim()));
    } else if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i]))
        code.push(lines[i]);
      const pre = `<pre class="gpt-code" tabindex="0"><code>${code.join("\n")}</code></pre>`;
      out.push(copy ? `<div class="gpt-code-wrap">${pre}<button type="button" class="gpt-code-copy" data-copy-code>${copy}</button></div>` : pre);
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
      // # and ## are the answer's sections, ### and below their parts (REV-6).
      // A numbered step heading gets its number in a circle (chat design §5.5).
      flush();
      const tag = /^#{3}/.test(line) ? "h4" : "h3";
      const text = line.replace(/^#{1,6}\s+/, "");
      const step = STEP.exec(text.replace(/\*\*/g, ""));
      const rest = step && text.replace(/\*\*/g, "").slice(step[0].length).trim();
      out.push(step && rest
        ? `<${tag} class="gpt-step-head"><span class="gpt-step">${step[1] ?? step[2] ?? step[3]}</span><span>${inline(rest)}</span></${tag}>`
        : `<${tag}>${inline(text)}</${tag}>`);
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
