// The LaTeX a model still writes now and then, as plain text the chat can
// show (plan MD-03): \(x^2\) → x², \frac{a}{b} → a/b, \sqrt{9} → √9, \cdot → ·.
// Inline code is left alone, and so is a price ($5). Used on answer
// text outside code blocks (markdown.ts) and on copied text (plain-text.ts).
const SYMBOLS: Record<string, string> = {
  cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓", le: "≤", leq: "≤", ge: "≥", geq: "≥",
  ne: "≠", neq: "≠", approx: "≈", pi: "π", infty: "∞", circ: "°", ldots: "…", cdots: "…",
  alpha: "α", beta: "β", Delta: "Δ", to: "→", Rightarrow: "⇒",
};

/** A fraction's or a root's part: bare when it is one word or number, else in brackets. */
const group = (part: string) => (/^[\w.]+$/.test(part.trim()) ? part.trim() : `(${part.trim()})`);

function convert(text: string): string {
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
      .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a: string, b: string) => `${group(a)}/${group(b)}`)
      .replace(/\\sqrt\{([^{}]*)\}/g, (_, a: string) => `√${group(a)}`);
    if (next === out) break;
    out = next;
  }
  return out
    .replace(/\\([a-z]+)(?![a-z])/gi, (whole, name: string) => SYMBOLS[name] ?? whole)
    .replace(/\^\{?([23])\}?(?!\d)/g, (_, d: string) => (d === "2" ? "²" : "³"))
    .replace(/\^\{([^{}]*)\}/g, (_, e: string) => `^${group(e)}`);
}

export function latexLite(line: string): string {
  return line
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : convert(part)))
    .join("");
}
