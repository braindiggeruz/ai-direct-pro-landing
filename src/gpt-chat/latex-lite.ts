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
const bare = (part: string) => /^[\p{L}\p{N}_.]+$/u.test(part.trim());
const group = (part: string) => (bare(part) ? part.trim() : `(${part.trim()})`);
/** Text only a screen reader reads (and a hand-made selection copies): the linear form of a drawn formula. */
const said = (text: string) => (text ? `<span class="sr-only">${text}</span>` : "");
/** One character as it is, more in brackets: x^n, x^(2n), a_1, a_(1,2). */
const mark = (sign: string, part: string) => (part.length > 1 ? [`${sign}(`, ")"] : [sign, ""]);

/**
 * `html`: the text is already escaped, and fractions two levels deep become
 * stacked <span class="gpt-frac">, ^{n} a <sup> and x_1, x_{1,2} a <sub>.
 * Only these fixed tags are written; what a model wrote stays text. Each drawn
 * piece carries its linear form for a screen reader ((a)/(b), ^, _).
 */
function convert(text: string, html = false): string {
  const sup = (e: string) => {
    const [open, close] = mark("^", e);
    return html ? `${said(open)}<sup>${e}</sup>${said(close)}` : `${open}${e}${close}`;
  };
  const sub = (e: string) => {
    const [open, close] = mark("_", e);
    return html ? `${said(open)}<sub>${e}</sub>${said(close)}` : `${open}${e}${close}`;
  };
  let out = text
    .replace(/\\[()[\]]|\$\$/g, "")
    // $x_1 = 2$ is a formula, «$5 va $10» two prices: only a pair around math loses its signs.
    .replace(/\$([^$\s](?:[^$]*[^$\s])?)\$/g, (whole, math: string) => (/[\\^_=]/.test(math) ? math : whole))
    .replace(/\\(?:left|right)(?![a-z])|\\[,;!]/gi, "")
    .replace(/\\(?:text|mathrm)\{([^{}]*)\}/g, "$1")
    .replace(/\^\{?\\circ\}?/g, "°");
  // Innermost first, so a root inside a fraction unfolds too. Each pass first
  // unfolds the powers and indices in braces (x^{2}, a_{1}), so a fraction
  // whose part has them is innermost too: \frac{x^{2}+1}{2}.
  for (let pass = 0; pass < 4; pass++) {
    const next = out
      // ^2 and ^{2} are ², but ^{2n} stays a power and x^23 a number.
      .replace(/\^(?:\{([23])\}|([23])(?!\d))/g, (_, a?: string, b?: string) => ((a ?? b) === "2" ? "²" : "³"))
      .replace(/\^\{([^{}]*)\}/g, (_, e: string) => sup(e.trim()))
      .replace(/_\{([^{}]*)\}/g, (_, e: string) => sub(e.trim()))
      .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a: string, b: string) => {
        if (!(html && pass < 2)) return `${group(a)}/${group(b)}`;
        const [x, y] = [a.trim(), b.trim()];
        const top = `${said(bare(x) ? "" : "(")}${x}${said(`${bare(x) ? "" : ")"}/${bare(y) ? "" : "("}`)}`;
        return `<span class="gpt-frac"><span>${top}</span><span>${y}${said(bare(y) ? "" : ")")}</span></span>`;
      })
      .replace(/\\sqrt\{([^{}]*)\}/g, (_, a: string) => `√${group(a)}`);
    if (next === out) break;
    out = next;
  }
  out = out.replace(/\\([a-z]+)(?![a-z])/gi, (whole, name: string) => SYMBOLS[name] ?? whole);
  return html
    ? out
        .replace(/\^([A-Za-z0-9])/g, (_, e: string) => sup(e))
        .replace(/_([A-Za-z0-9])/g, (_, e: string) => sub(e))
    : out;
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
