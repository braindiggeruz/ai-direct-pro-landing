// Local learning tools. No model calls, storage, cookies or input telemetry.
const absolute = (n) => n < 0n ? -n : n;
function fraction(n, d = 1n) {
  if (d === 0n) throw new Error('zero_denominator');
  if (d < 0n) { n = -n; d = -d; }
  let a = absolute(n), b = d;
  while (b) { const r = a % b; a = b; b = r; }
  return { n: n / a, d: d / a };
}
const plus = (a, b) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const minus = (a, b) => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
const times = (a, b) => fraction(a.n * b.n, a.d * b.d);
const divide = (a, b) => fraction(a.n * b.d, a.d * b.n);
const show = (a) => a.d === 1n ? String(a.n) : `${a.n}/${a.d}`;
function number(text) {
  if (!/^(?:\d{1,9}(?:\.\d{1,6})?|\.\d{1,6})$/.test(text)) throw new Error('unsupported_number');
  const [whole, decimals = ''] = text.split('.');
  return fraction(BigInt((whole || '0') + decimals), 10n ** BigInt(decimals.length));
}
function side(text) {
  const terms = text.match(/[+-]?[^+-]+/g);
  if (!terms || terms.join('') !== text || terms.length > 30) throw new Error('unsupported_expression');
  let a = fraction(0n), b = fraction(0n);
  for (let term of terms) {
    const sign = term.startsWith('-') ? -1n : 1n;
    term = term.replace(/^[+-]/, '');
    if (term.endsWith('x')) {
      if (term === '*x') throw new Error('unsupported_expression');
      const coefficient = term.slice(0, -1).replace(/\*$/, '');
      const value = coefficient ? number(coefficient) : fraction(1n);
      a = plus(a, fraction(sign * value.n, value.d));
    } else {
      const value = number(term);
      b = plus(b, fraction(sign * value.n, value.d));
    }
  }
  return { a, b };
}

/** Exact rational arithmetic for a*x+b=c*x+d; never evaluates source code. */
export function solveLinearEquation(input) {
  if (typeof input !== 'string' || input.length > 160 || /[\d.,]\s+[\d.,]/.test(input)) throw new Error('unsupported_expression');
  const expression = input.toLowerCase().replace(/\s/g, '').replace(/−/g, '-').replace(/×/g, '*').replace(/,/g, '.');
  if (!/^[0-9x.+*=\-]+$/.test(expression) || expression.split('=').length !== 2) throw new Error('unsupported_expression');
  const [leftText, rightText] = expression.split('=');
  const left = side(leftText), right = side(rightText);
  const coefficient = minus(left.a, right.a), total = minus(right.b, left.b);
  const steps = [
    `(${show(left.a)} − (${show(right.a)})) × x = ${show(right.b)} − (${show(left.b)})`,
    `${show(coefficient)} × x = ${show(total)}`,
  ];
  if (coefficient.n === 0n) {
    return total.n === 0n
      ? { kind: 'all', answer: 'Har qanday x mos keladi.', steps, verification: 'Ikki tomon bir xil ifodaga teng.' }
      : { kind: 'none', answer: 'Yechim yo‘q.', steps, verification: `0 soni ${show(total)} ga teng bo‘la olmaydi.` };
  }
  const x = divide(total, coefficient);
  const leftValue = plus(times(left.a, x), left.b), rightValue = plus(times(right.a, x), right.b);
  if (leftValue.n !== rightValue.n || leftValue.d !== rightValue.d) throw new Error('verification_failed');
  steps.push(`x = (${show(total)}) ÷ (${show(coefficient)}) = ${show(x)}`);
  return { kind: 'one', answer: `x = ${show(x)}`, value: show(x), steps,
    verification: `O‘rniga qo‘yib tekshirish: chap tomon = ${show(leftValue)}, o‘ng tomon = ${show(rightValue)}.` };
}

function bindEquation(root) {
  const form = root.querySelector('form'), input = root.querySelector('input');
  const output = root.querySelector('[data-equation-output]');
  if (!form || !input || !output) return;
  const submit = form.querySelector('button');
  if (submit) submit.disabled = false;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    output.replaceChildren();
    try {
      const result = solveLinearEquation(input.value);
      input.removeAttribute('aria-invalid');
      const heading = document.createElement('p');
      heading.className = 'ps-result'; heading.textContent = result.answer;
      const list = document.createElement('ol');
      for (const text of result.steps) { const item = document.createElement('li'); item.textContent = text; list.append(item); }
      const check = document.createElement('p'); check.textContent = result.verification;
      output.append(heading, list, check);
    } catch {
      input.setAttribute('aria-invalid', 'true');
      output.textContent = 'Masalan, 2x + 3 = x + 8 yozing. Faqat x, son, +, − va bitta = belgisi mumkin. Qavs, kasr chizig‘i va darajalar bu vositada qo‘llanmaydi; o‘nli kasrning 6 tagacha xonasi mumkin.';
    }
  });
}

function bindMultiplication(root) {
  const controls = root.querySelector('[data-multiplication-controls]');
  const a = root.querySelector('[data-factor-a]'), b = root.querySelector('[data-factor-b]');
  const output = root.querySelector('output');
  if (!controls || !a || !b || !output) return;
  const update = () => {
    const x = Number(a.value), y = Number(b.value);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 1 || x > 10 || y < 1 || y > 10) return;
    output.textContent = `${x} × ${y} = ${x * y}`;
    for (const cell of root.querySelectorAll('[data-mul-a]')) {
      cell.toggleAttribute('data-selected', Number(cell.dataset.mulA) === x && Number(cell.dataset.mulB) === y);
      cell.toggleAttribute('data-related', Number(cell.dataset.mulA) === x || Number(cell.dataset.mulB) === y);
    }
  };
  controls.hidden = false; a.addEventListener('change', update); b.addEventListener('change', update); update();
}

if (typeof document !== 'undefined') {
  document.querySelectorAll('[data-linear-equation]').forEach(bindEquation);
  document.querySelectorAll('[data-multiplication]').forEach(bindMultiplication);
}
