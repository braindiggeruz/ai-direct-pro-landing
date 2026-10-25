// The calculator widget's arithmetic (Page.widgets 'calculator'): a tokenizer
// and a recursive-descent parser over a closed grammar, evaluated as plain
// numbers. Nothing is ever run as code, and no regular expression decides
// what is computed: an input that is not in the grammar is an error with a
// code, which the widget turns into a message in the page's language.
//
//   expression := additive
//   additive   := multiply (('+' | '-') multiply)*
//   multiply   := unary (('*' | '/') unary | implicit unary)*
//                 implicit: 2π, 2(3+4), (1+2)(3+4), 2sin(30), 2√9 — never 2 3
//   unary      := ('+' | '-') unary | power
//   power      := postfix ('^' unary)?          right to left: 2^3^2 = 2^9
//   postfix    := primary '%'*
//   primary    := number | pi | e | '(' additive ')' | function argument
//   argument   := '(' additive ')' | ('+' | '-')* postfix     sin 30 = sin(30)
//
// Percent: x% is x/100, except right of + or −, where it is a share of the
// left side, as on a phone calculator: 200 + 10% = 220, 200 × 10% = 20.
// Unary minus binds looser than ^: -2^2 = -4, 2^-1 = 0.5.
// Results are rounded to 12 significant digits (0.1 + 0.2 = 0.3).

export type AngleUnit = 'deg' | 'rad';
export type CalcErrorCode =
  | 'empty'
  | 'too-long'
  | 'bad-char'
  | 'bad-number'
  | 'unknown-name'
  | 'missing-operand'
  | 'missing-operator'
  | 'unbalanced'
  | 'div-zero'
  | 'domain'
  | 'undefined'
  | 'overflow';

export class CalcError extends Error {
  readonly code: CalcErrorCode;
  /** The offending piece of the input (a symbol, a name, a number), when there is one. */
  readonly token: string;
  constructor(code: CalcErrorCode, token = '') {
    super(token ? `${code}: ${token}` : code);
    this.name = 'CalcError';
    this.code = code;
    this.token = token;
  }
}

/** The longest expression the widget takes (its input's maxlength). */
export const MAX_EXPRESSION = 200;

type FunctionName = 'sqrt' | 'sin' | 'cos' | 'tan' | 'log' | 'ln';
type Operator = '+' | '-' | '*' | '/' | '^' | '%';
type Token =
  | { kind: 'number'; value: number; text: string }
  | { kind: 'constant'; value: number; text: string }
  | { kind: 'function'; name: FunctionName; text: string }
  | { kind: 'operator'; op: Operator; text: string }
  | { kind: '(' | ')'; text: string };

// Looked up with Object.hasOwn only: «constructor» or «toString» must not reach Object.prototype.
const NAMES: Record<string, Token> = {
  sqrt: { kind: 'function', name: 'sqrt', text: 'sqrt' },
  sin: { kind: 'function', name: 'sin', text: 'sin' },
  cos: { kind: 'function', name: 'cos', text: 'cos' },
  tan: { kind: 'function', name: 'tan', text: 'tan' },
  tg: { kind: 'function', name: 'tan', text: 'tg' },
  log: { kind: 'function', name: 'log', text: 'log' },
  lg: { kind: 'function', name: 'log', text: 'lg' },
  ln: { kind: 'function', name: 'ln', text: 'ln' },
  pi: { kind: 'constant', value: Math.PI, text: 'pi' },
  e: { kind: 'constant', value: Math.E, text: 'e' },
};

const SYMBOLS: Record<string, Token> = {
  '+': { kind: 'operator', op: '+', text: '+' },
  '-': { kind: 'operator', op: '-', text: '-' },
  '−': { kind: 'operator', op: '-', text: '−' }, // − minus sign
  '–': { kind: 'operator', op: '-', text: '–' }, // – en dash
  '*': { kind: 'operator', op: '*', text: '*' },
  '×': { kind: 'operator', op: '*', text: '×' }, // ×
  '·': { kind: 'operator', op: '*', text: '·' }, // ·
  '⋅': { kind: 'operator', op: '*', text: '⋅' }, // ⋅
  '/': { kind: 'operator', op: '/', text: '/' },
  '÷': { kind: 'operator', op: '/', text: '÷' }, // ÷
  ':': { kind: 'operator', op: '/', text: ':' }, // school division sign
  '^': { kind: 'operator', op: '^', text: '^' },
  '%': { kind: 'operator', op: '%', text: '%' },
  '(': { kind: '(', text: '(' },
  ')': { kind: ')', text: ')' },
  'π': { kind: 'constant', value: Math.PI, text: 'π' }, // π
  '√': { kind: 'function', name: 'sqrt', text: '√' }, // √
};

const SPACE = /\s/;
const DIGIT = /[0-9]/;
const LETTER = /[a-zа-яё]/i;

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (SPACE.test(ch)) { i++; continue; }
    if (DIGIT.test(ch) || ((ch === '.' || ch === ',') && DIGIT.test(input[i + 1] ?? ''))) {
      let j = i;
      while (j < input.length && DIGIT.test(input[j])) j++;
      if (input[j] === '.' || input[j] === ',') {
        j++;
        while (j < input.length && DIGIT.test(input[j])) j++;
      }
      // 1.2.3 or 1,5,2: one decimal separator per number.
      if ((input[j] === '.' || input[j] === ',') && DIGIT.test(input[j + 1] ?? '')) {
        let k = j + 1;
        while (k < input.length && (DIGIT.test(input[k]) || input[k] === '.' || input[k] === ',')) k++;
        throw new CalcError('bad-number', input.slice(i, k));
      }
      const text = input.slice(i, j);
      tokens.push({ kind: 'number', value: Number(text.replace(',', '.')), text });
      i = j;
      continue;
    }
    if (ch === '*' && input[i + 1] === '*') {
      tokens.push({ kind: 'operator', op: '^', text: '**' });
      i += 2;
      continue;
    }
    // Superscript squares and cubes, as pasted from a textbook: 5² = 5^2.
    if (ch === '²' || ch === '³') {
      tokens.push({ kind: 'operator', op: '^', text: ch }, { kind: 'number', value: ch === '²' ? 2 : 3, text: ch });
      i++;
      continue;
    }
    if (LETTER.test(ch)) {
      let j = i;
      while (j < input.length && LETTER.test(input[j])) j++;
      const word = input.slice(i, j);
      const name = word.toLowerCase();
      if (!Object.hasOwn(NAMES, name)) throw new CalcError('unknown-name', word);
      tokens.push(NAMES[name]);
      i = j;
      continue;
    }
    if (!Object.hasOwn(SYMBOLS, ch)) throw new CalcError('bad-char', ch);
    tokens.push(SYMBOLS[ch]);
    i++;
  }
  return tokens;
}

type Node =
  | { type: 'number'; value: number }
  | { type: 'negate'; operand: Node }
  | { type: 'percent'; operand: Node }
  | { type: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: Node; right: Node }
  | { type: 'call'; name: FunctionName; argument: Node };

class Parser {
  private index = 0;
  private readonly tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): Node {
    const node = this.additive();
    const rest = this.peek();
    if (rest) {
      if (rest.kind === ')') throw new CalcError('unbalanced', ')');
      throw new CalcError('missing-operator', rest.text);
    }
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private isOperator(token: Token | undefined, ...ops: Operator[]): boolean {
    return token?.kind === 'operator' && ops.includes(token.op);
  }

  private additive(): Node {
    let node = this.multiply();
    while (this.isOperator(this.peek(), '+', '-')) {
      const op = (this.tokens[this.index++] as { op: '+' | '-' }).op;
      node = { type: 'binary', op, left: node, right: this.multiply() };
    }
    return node;
  }

  private multiply(): Node {
    let node = this.unary();
    for (;;) {
      const next = this.peek();
      if (this.isOperator(next, '*', '/')) {
        this.index++;
        node = { type: 'binary', op: (next as { op: '*' | '/' }).op, left: node, right: this.unary() };
      } else if (next && (next.kind === '(' || next.kind === 'constant' || next.kind === 'function')) {
        // Implicit multiplication; a number after a number is a missing sign (2 3).
        node = { type: 'binary', op: '*', left: node, right: this.unary() };
      } else {
        return node;
      }
    }
  }

  private unary(): Node {
    const next = this.peek();
    if (this.isOperator(next, '+', '-')) {
      this.index++;
      const operand = this.unary();
      return (next as { op: '+' | '-' }).op === '-' ? { type: 'negate', operand } : operand;
    }
    return this.power();
  }

  private power(): Node {
    const base = this.postfix();
    if (this.isOperator(this.peek(), '^')) {
      this.index++;
      return { type: 'binary', op: '^', left: base, right: this.unary() };
    }
    return base;
  }

  private postfix(): Node {
    let node = this.primary();
    while (this.isOperator(this.peek(), '%')) {
      this.index++;
      node = { type: 'percent', operand: node };
    }
    return node;
  }

  private primary(): Node {
    const token = this.tokens[this.index++];
    if (!token) throw new CalcError('missing-operand');
    switch (token.kind) {
      case 'number':
      case 'constant':
        return { type: 'number', value: token.value };
      case '(': {
        if (this.peek()?.kind === ')') throw new CalcError('missing-operand', '()');
        const inner = this.additive();
        if (this.peek()?.kind !== ')') {
          if (!this.peek()) throw new CalcError('unbalanced', '(');
          throw new CalcError('missing-operator', this.peek()!.text);
        }
        this.index++;
        return inner;
      }
      case 'function':
        return { type: 'call', name: token.name, argument: this.argument() };
      case ')': {
        // «2 + )» or «sin)» lacks a number; «)» with nothing open before it is a bracket too many.
        const before = this.tokens[this.index - 2];
        throw new CalcError(before && (before.kind === 'operator' || before.kind === 'function') ? 'missing-operand' : 'unbalanced', ')');
      }
      default:
        throw new CalcError('missing-operand', token.text);
    }
  }

  /** A function's argument: a bracket, or without one the next signed operand (sin 30, √9, √-4). */
  private argument(): Node {
    const next = this.peek();
    if (!next) throw new CalcError('missing-operand');
    if (next.kind === '(') return this.primary();
    if (this.isOperator(next, '+', '-')) {
      this.index++;
      const operand = this.argument();
      return (next as { op: '+' | '-' }).op === '-' ? { type: 'negate', operand } : operand;
    }
    return this.postfix();
  }
}

export function parse(input: string): Node {
  if (input.length > MAX_EXPRESSION) throw new CalcError('too-long');
  const tokens = tokenize(input);
  if (!tokens.length) throw new CalcError('empty');
  return new Parser(tokens).parse();
}

const SNAP = 1e-12;

function checked(value: number): number {
  if (Number.isNaN(value)) throw new CalcError('domain');
  if (!Number.isFinite(value)) throw new CalcError('overflow');
  return value;
}

/** sin, cos and tan; whole multiples of 90° are exact, and tan of 90° + k·180° has no value. */
function trig(name: 'sin' | 'cos' | 'tan', x: number, angle: AngleUnit): number {
  if (angle === 'deg') {
    const turn = ((x % 360) + 360) % 360;
    if (Number.isInteger(turn) && turn % 90 === 0) {
      const quarter = turn / 90;
      if (name === 'sin') return [0, 1, 0, -1][quarter];
      if (name === 'cos') return [1, 0, -1, 0][quarter];
      if (quarter % 2 === 1) throw new CalcError('undefined');
      return 0;
    }
    x = (x * Math.PI) / 180;
  }
  if (name === 'tan' && Math.abs(Math.cos(x)) < SNAP) throw new CalcError('undefined');
  const value = name === 'sin' ? Math.sin(x) : name === 'cos' ? Math.cos(x) : Math.tan(x);
  return Math.abs(value) < SNAP ? 0 : value;
}

function call(name: FunctionName, x: number, angle: AngleUnit): number {
  switch (name) {
    case 'sqrt':
      if (x < 0) throw new CalcError('domain');
      return Math.sqrt(x);
    case 'log':
      if (x <= 0) throw new CalcError('domain');
      return Math.log10(x);
    case 'ln':
      if (x <= 0) throw new CalcError('domain');
      return Math.log(x);
    default:
      return trig(name, x, angle);
  }
}

function evaluateNode(node: Node, angle: AngleUnit): number {
  switch (node.type) {
    case 'number':
      return node.value;
    case 'negate':
      return -evaluateNode(node.operand, angle);
    case 'percent':
      return checked(evaluateNode(node.operand, angle) / 100);
    case 'call':
      return checked(call(node.name, evaluateNode(node.argument, angle), angle));
    case 'binary': {
      const left = evaluateNode(node.left, angle);
      // 200 + 10% = 220: a percent right of + or − is a share of the left side.
      if ((node.op === '+' || node.op === '-') && node.right.type === 'percent') {
        const share = checked(left * (evaluateNode(node.right.operand, angle) / 100));
        return checked(node.op === '+' ? left + share : left - share);
      }
      const right = evaluateNode(node.right, angle);
      switch (node.op) {
        case '+': return checked(left + right);
        case '-': return checked(left - right);
        case '*': return checked(left * right);
        case '/':
          if (right === 0) throw new CalcError('div-zero');
          return checked(left / right);
        case '^':
          if (left === 0 && right < 0) throw new CalcError('div-zero');
          return checked(left ** right);
      }
    }
  }
}

/** The value of an expression; throws CalcError. Rounded to 12 significant digits. */
export function evaluate(input: string, options: { angle?: AngleUnit } = {}): number {
  const value = evaluateNode(parse(input), options.angle ?? 'deg');
  const rounded = Number(checked(value).toPrecision(12));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Whether the expression uses an angle (sin, cos, tan), so its value depends on DEG/RAD. */
export function usesAngles(input: string): boolean {
  try {
    return tokenize(input).some((token) => token.kind === 'function' && (token.name === 'sin' || token.name === 'cos' || token.name === 'tan'));
  } catch {
    return false;
  }
}

/**
 * A number as the widget shows it: plain up to 15 digits, else as
 * 1.5×10^20, which the calculator reads back (a history entry runs again).
 */
export function formatNumber(value: number): string {
  if (value === 0) return '0';
  const v = Number(value.toPrecision(12));
  const abs = Math.abs(v);
  if (abs >= 1e15 || abs < 1e-6) {
    const [mantissa, exponent] = v.toExponential(11).split('e');
    return `${mantissa.replace(/\.?0+$/, '')}×10^${Number(exponent)}`;
  }
  return String(v);
}

export type CalcResult =
  | { ok: true; value: number; text: string }
  | { ok: false; code: CalcErrorCode; token: string };

/** evaluate() without throwing: the value and its text, or the error's code. */
export function calculate(input: string, options: { angle?: AngleUnit } = {}): CalcResult {
  try {
    const value = evaluate(input, options);
    return { ok: true, value, text: formatNumber(value) };
  } catch (error) {
    if (error instanceof CalcError) return { ok: false, code: error.code, token: error.token };
    // A stack overflow on a pathological input is still only "too long".
    return { ok: false, code: 'too-long', token: '' };
  }
}
