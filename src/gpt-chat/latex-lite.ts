// The LaTeX a model still writes now and then, as plain text the chat can
// show (plan MD-03): \(x^2\) → x², \frac{a}{b} → a/b, \sqrt{9} → √9, \cdot → ·.
// Inline code is left alone, and so is a price ($5). Used on answer
// text outside code blocks (markdown.ts) and on copied text (plain-text.ts).
// A display formula ($$…$$, \[…\], a line of \(…\) alone) is drawn instead
// (chat design §5.5): mathHtml stacks its fractions and lowers its indices.
const SYMBOLS: Record<string, string> = {
  cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓", le: "≤", leq: "≤", ge: "≥", geq: "≥",
  ne: "≠", neq: "≠", approx: "≈", pi: "π", infty: "∞", circ: "°", ldots: "…", cdots: "…",
  alpha: "α", beta: "β", Delta: "Δ", to: "→", Rightarrow: "⇒", quad: " ", qquad: "  ",
};

/** A fraction's or a root's part: bare when it is one word or number, else in brackets. */
const group = (part: string) => (/^[\w.]+$/.test(part.trim()) ? part.trim() : `(${part.trim()})`);

/**
 * `html`: the text is already escaped, and fractions two levels deep become
 * stacked <span class="gpt-frac">, ^{n} a <sup> and x_1, x_{1,2} a <sub>.
 * Only these fixed tags are written; what a model wrote stays text.
 */
function convert(text: string, html = false): string {
  let out = text
    .replace(/\\[()[\]]|\$\$/g, "")
    // $x_1 = 2$ is a formula, «$5 va $10» two prices: only a pair around math loses its signs.
    .replace(/\$([^$\s](?:[^$]*[^$\s])?)\$/g, (whole, math: string) => (/[\\^_=]/.test(math) ? math : whole))
    .replace(/\\(?:left|right)(?![a-z])|\\[,;!]/gi, "")
    .replace(/\\(?:text|mathrm)\{([^{}]*)\}/g, "$1")
    .replace(/\^\{?\\circ\}?/g, "°");
  // Innermost first, so a root inside a fraction unfolds too.
  for (let pass = 0; pass < 4; pass++) {
    const next = out
      .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a: string, b: string) =>
        html && pass < 2 ? `<span class="gpt-frac"><span>${a.trim()}</span><span>${b.trim()}</span></span>` : `${group(a)}/${group(b)}`)
      .replace(/\\sqrt\{([^{}]*)\}/g, (_, a: string) => `√${group(a)}`);
    if (next === out) break;
    out = next;
  }
  out = out
    .replace(/\\([a-z]+)(?![a-z])/gi, (whole, name: string) => SYMBOLS[name] ?? whole)
    .replace(/\^\{?([23])\}?(?!\d)/g, (_, d: string) => (d === "2" ? "²" : "³"));
  return html
    ? out
        .replace(/\^\{([^{}]*)\}|\^([A-Za-z0-9])/g, (_, a?: string, b?: string) => `<sup>${a ?? b}</sup>`)
        .replace(/_\{([^{}]*)\}|_([A-Za-z0-9])/g, (_, a?: string, b?: string) => `<sub>${a ?? b}</sub>`)
    : out.replace(/\^\{([^{}]*)\}/g, (_, e: string) => `^${group(e)}`);
}

export function latexLite(line: string): string {
  return line
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : convert(part)))
    .join("");
}

/** One line of a display formula, escaped by the caller, as HTML (chat design §5.5). */
export function mathHtml(escapedLine: string): string {
  return convert(escapedLine, true);
}
