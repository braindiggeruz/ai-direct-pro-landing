// The calculator widget's arithmetic (src/tools/calculator/engine.ts): a
// closed grammar, no eval. Precedence, the right-to-left power, unary minus,
// percent, functions in degrees and radians, implicit multiplication, the
// error codes the widget turns into messages, and the number format.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { CalcError, MAX_EXPRESSION, calculate, evaluate, formatNumber, usesAngles, type CalcErrorCode } from '../src/tools/calculator/engine';

const value = (expression: string, angle: 'deg' | 'rad' = 'deg') => evaluate(expression, { angle });
const fails = (expression: string, code: CalcErrorCode, angle: 'deg' | 'rad' = 'deg') => {
  const result = calculate(expression, { angle });
  assert.equal(result.ok, false, `${expression} should fail`);
  if (!result.ok) assert.equal(result.code, code, expression);
};

// Precedence and associativity.
test('× and ÷ before + and −', () => assert.equal(value('2+3*4'), 14));
test('brackets first', () => assert.equal(value('(2+3)*4'), 20));
test('subtraction is left to right', () => assert.equal(value('10-4-3'), 3));
test('division is left to right', () => assert.equal(value('100/10/5'), 2));
test('× and ÷ share a level, left to right', () => assert.equal(value('6÷3×2'), 4));
test('^ is right to left: 2^3^2 = 2^9', () => assert.equal(value('2^3^2'), 512));
test('^ before ×', () => assert.equal(value('2*3^2'), 18));
test('unary minus is looser than ^: -2^2 = -4', () => assert.equal(value('-2^2'), -4));
test('a negative base in brackets: (-2)^2 = 4', () => assert.equal(value('(-2)^2'), 4));
test('a negative exponent: 2^-1 = 0.5', () => assert.equal(value('2^-1'), 0.5));
test('double minus: 5--3 = 8', () => assert.equal(value('5--3'), 8));
test('unary plus is allowed', () => assert.equal(value('+5+-2'), 3));
test('nested brackets', () => assert.equal(value('((1+2)*(3+4))/7'), 3));
test('** is a power too', () => assert.equal(value('2**10'), 1024));
test('superscript ² and ³', () => { assert.equal(value('5²'), 25); assert.equal(value('2³'), 8); });

// Signs people type.
test('the minus sign, the en dash and ASCII - are one minus', () => assert.equal(value('10−2–3-1'), 4));
test('× · and * multiply; ÷ / and : divide', () => { assert.equal(value('2×3·4*1'), 24); assert.equal(value('12:4'), 3); assert.equal(value('12÷4/3'), 1); });
test('decimal point or comma', () => { assert.equal(value('1.5+1,5'), 3); assert.equal(value('.5+,5'), 1); assert.equal(value('5.'), 5); });
test('spaces are ignored', () => assert.equal(value('  2 +\t3 * 4 '), 14));

// Percent.
test('x% alone is x/100', () => assert.equal(value('10%'), 0.1));
test('a + b% adds b% of a', () => assert.equal(value('200+10%'), 220));
test('a − b% takes b% of a away', () => assert.equal(value('200-10%'), 180));
test('a × b% is b% of a', () => assert.equal(value('200*10%'), 20));
test('a ÷ b%', () => assert.equal(value('50/10%'), 500));
test('percent of a bracket: (100+50)+10% = 165', () => assert.equal(value('(100+50)+10%'), 165));

// Functions and constants.
test('square root: sqrt, √ and √ without brackets', () => { assert.equal(value('sqrt(16)'), 4); assert.equal(value('√16'), 4); assert.equal(value('√(9+7)'), 4); });
test('√ takes the next operand, ^ applies to the root: √9^2 = 9', () => assert.equal(value('√9^2'), 9));
test('sin, cos, tan in degrees, exact at whole multiples of 90°', () => {
  assert.equal(value('sin(30)'), 0.5);
  assert.equal(value('cos(60)'), 0.5);
  assert.equal(value('tan(45)'), 1);
  assert.equal(value('sin(180)'), 0);
  assert.equal(value('cos(90)'), 0);
  assert.equal(value('sin(-90)'), -1);
  assert.equal(value('cos(360)'), 1);
});
test('a function without brackets takes the next number: sin 30', () => { assert.equal(value('sin 30'), 0.5); assert.equal(value('sin30'), 0.5); assert.equal(value('cos -60'), 0.5); });
test('a function result is raised after: sin(30)^2 = 0.25', () => assert.equal(value('sin(30)^2'), 0.25));
test('radians: sin(π/2) = 1, cos(π) = -1, sin(π) = 0', () => {
  assert.equal(value('sin(pi/2)', 'rad'), 1);
  assert.equal(value('cos(π)', 'rad'), -1);
  assert.equal(value('sin(pi)', 'rad'), 0);
});
test('degrees and radians give different values for the same input', () => assert.notEqual(value('sin(1)', 'deg'), value('sin(1)', 'rad')));
test('tg is tan; lg is log10', () => { assert.equal(value('tg(45)'), 1); assert.equal(value('lg(100)'), 2); });
test('log is base 10, ln is natural', () => { assert.equal(value('log(1000)'), 3); assert.equal(value('ln(e)'), 1); assert.equal(value('ln(1)'), 0); });
test('pi, π and e', () => { assert.equal(value('pi'), 3.14159265359); assert.equal(value('π'), 3.14159265359); assert.equal(value('e'), 2.71828182846); });
test('names are case-insensitive', () => assert.equal(value('SIN(30)+Sqrt(4)'), 2.5));

// Implicit multiplication.
test('implicit ×: 2π, 2(3+4), (1+2)(3+4), 2sin(30), 2√9', () => {
  assert.equal(value('2π'), 6.28318530718);
  assert.equal(value('2(3+4)'), 14);
  assert.equal(value('(1+2)(3+4)'), 21);
  assert.equal(value('2sin(30)'), 1);
  assert.equal(value('2√9'), 6);
});
test('implicit × is as strong as ×: 1/2π = (1/2)·π', () => assert.equal(value('1/2π'), value('(1/2)*pi')));

// Rounding and format.
test('12 significant digits: 0.1 + 0.2 = 0.3', () => assert.equal(value('0.1+0.2'), 0.3));
test('1/3 is shown with 12 digits', () => assert.equal(calculate('1/3').ok && (calculate('1/3') as { text: string }).text, '0.333333333333'));
test('-0 is shown as 0', () => assert.equal(formatNumber(value('-0*5')), '0'));
test('large and small numbers as ×10^, which reads back', () => {
  assert.equal(formatNumber(1e20), '1×10^20');
  assert.equal(formatNumber(-2.5e-7), '-2.5×10^-7');
  assert.equal(formatNumber(123456), '123456');
  assert.equal(formatNumber(0.000001), '0.000001');
  assert.equal(value(formatNumber(1.5e20)), 1.5e20);
  assert.equal(value(formatNumber(2.5e-7)), 2.5e-7);
});

// Errors, each with its code.
test('division by zero', () => { fails('1/0', 'div-zero'); fails('5/(3-3)', 'div-zero'); fails('0^-1', 'div-zero'); });
test('empty input', () => { fails('', 'empty'); fails('   ', 'empty'); });
test('too long', () => fails('1+'.repeat(MAX_EXPRESSION), 'too-long'));
test('a sign at the end or two signs in a row', () => { fails('2+', 'missing-operand'); fails('2*/3', 'missing-operand'); fails('*2', 'missing-operand'); fails('()', 'missing-operand'); fails('sin', 'missing-operand'); fails('sqrt()', 'missing-operand'); });
test('two numbers without a sign', () => { fails('2 3', 'missing-operator'); fails('(2)3', 'missing-operator'); fails('pi2', 'missing-operator'); });
test('brackets that do not match', () => { fails('(2+3', 'unbalanced'); fails('2+3)', 'unbalanced'); fails(')', 'unbalanced'); fails('((1)', 'unbalanced'); });
test('a symbol outside the grammar', () => { fails('2#3', 'bad-char'); fails('2&&3', 'bad-char'); fails('1;2', 'bad-char'); });
test('a number with two decimal points', () => { fails('1.2.3', 'bad-number'); fails('1,5,2', 'bad-number'); });
test('an unknown name, even a JavaScript one', () => {
  for (const input of ['abc', 'x+1', 'alert(1)', 'Math.PI', 'constructor', 'toString', '__proto__', 'hasOwnProperty', 'sinpi', 'корень(4)']) fails(input, input === '__proto__' ? 'bad-char' : 'unknown-name');
  const result = calculate('foo+1');
  assert.ok(!result.ok && result.token === 'foo');
});
test('no value: a negative root, a non-positive logarithm, a negative base to a fraction', () => {
  fails('sqrt(-4)', 'domain');
  fails('√-4', 'domain');
  fails('log(0)', 'domain');
  fails('ln(-1)', 'domain');
  fails('(-8)^(1/3)', 'domain');
});
test('tan of 90° + k·180° has no value, in degrees and radians', () => { fails('tan(90)', 'undefined'); fails('tan(270)', 'undefined'); fails('tan(-90)', 'undefined'); fails('tan(pi/2)', 'undefined', 'rad'); });
test('overflow', () => { fails('10^400', 'overflow'); fails('9^9^9', 'overflow'); });
test('evaluate throws a CalcError with the code', () => {
  assert.throws(() => evaluate('1/0'), (error: unknown) => error instanceof CalcError && error.code === 'div-zero');
});
test('deep brackets within the length limit still evaluate', () => assert.equal(value(`${'('.repeat(90)}1${')'.repeat(90)}`), 1));

test('usesAngles tells DEG/RAD-dependent expressions', () => {
  assert.equal(usesAngles('sin(30)+1'), true);
  assert.equal(usesAngles('tg 45'), true);
  assert.equal(usesAngles('sqrt(2)+log(3)'), false);
  assert.equal(usesAngles('2#'), false);
});

test('the engine and the widget never evaluate code: no eval, no Function, no innerHTML', () => {
  for (const file of ['src/tools/calculator/engine.ts', 'src/tools/calculator/main.ts']) {
    // Code only: the comments may name what the code does not do.
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(source, /\beval\s*\(|new\s+Function|Function\s*\(|innerHTML|insertAdjacentHTML|document\.write/, file);
  }
});
