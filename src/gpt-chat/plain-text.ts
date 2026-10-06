import { latexLite } from "./latex-lite";

/**
 * An answer as text to paste into Telegram or Instagram (plan COPY-01): no #,
 * **, __, ~~, backticks, emphasis stars or table rules. A list item starts
 * with «• », a table row reads «a — b», a link «text (url)», a formula as
 * plain text (latex-lite.ts). Code blocks stay as written, without fences.
 */
export function plainText(md: string): string {
  let fenced = false;
  const out: string[] = [];
  for (const raw of md.split(/\r?\n/)) {
    if (/^\s*```/.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) out.push(raw);
    else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) out.push("");
    else if (raw.includes("|") && /^[\s|:-]+$/.test(raw) && raw.includes("-")) continue;
    else {
      const line = latexLite(raw)
        .replace(/^\s*#{1,6}\s+/, "")
        .replace(/^(\s*)>\s?/, "$1")
        .replace(/^(\s*)[-*+]\s+/, "$1• ")
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
        .replace(/\*\*|__|~~|`/g, "")
        .replace(/(^|[^*])\*([^\s*](?:[^*]*[^\s*])?)\*(?!\*)/g, "$1$2");
      out.push(/^\s*\|.*\|\s*$/.test(line)
        ? line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()).join(" — ")
        : line);
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
