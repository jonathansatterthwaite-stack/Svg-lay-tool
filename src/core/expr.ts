/**
 * A small, safe expression language for variable bindings. No eval: the
 * source is tokenised and parsed into an AST, then evaluated against an
 * environment of numbers.
 *
 * Supported: numbers, identifiers, + - * / % ^, unary - and !, comparisons
 * (< <= > >= == !=), && ||, `cond ? a : b`, parentheses, and functions:
 * abs, floor, ceil, round, trunc, sqrt, pow, min, max, clamp, lerp, mod,
 * sin, cos, tan, asin, acos, atan, atan2, sign, step, smoothstep, wrap.
 * Booleans are 1 and 0. Constants: pi, tau, e, true, false.
 */

export type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'unary'; op: '-' | '!'; arg: Expr }
  | { kind: 'binary'; op: string; left: Expr; right: Expr }
  | { kind: 'cond'; test: Expr; yes: Expr; no: Expr }
  | { kind: 'call'; name: string; args: Expr[] };

export type Env = Record<string, number>;

export class ExprError extends Error {}

type Token = { type: 'num'; value: number } | { type: 'id'; value: string } | { type: 'op'; value: string } | { type: 'end' };

const OPS = ['&&', '||', '<=', '>=', '==', '!=', '+', '-', '*', '/', '%', '^', '<', '>', '!', '(', ')', ',', '?', ':'];

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i.exec(src.slice(i));
      if (!m) throw new ExprError(`Bad number at ${i}`);
      out.push({ type: 'num', value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ type: 'id', value: m[0] });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExprError(`Unexpected '${ch}' at ${i}`);
    out.push({ type: 'op', value: op });
    i += op.length;
  }
  out.push({ type: 'end' });
  return out;
}

const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
  '^': 7,
};

export function parseExpr(src: string): Expr {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const isOp = (v: string) => peek().type === 'op' && (peek() as { value: string }).value === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExprError(`Expected '${v}'`);
    pos++;
  };

  function parseTernary(): Expr {
    const test = parseBinary(0);
    if (isOp('?')) {
      pos++;
      const yes = parseTernary();
      expect(':');
      const no = parseTernary();
      return { kind: 'cond', test, yes, no };
    }
    return test;
  }

  function parseBinary(minPrec: number): Expr {
    let left = parseUnary();
    for (;;) {
      const t = peek();
      if (t.type !== 'op' || !(t.value in PRECEDENCE) || PRECEDENCE[t.value] < minPrec) return left;
      const op = t.value;
      pos++;
      const prec = PRECEDENCE[op];
      const right = op === '^' ? parseBinary(prec) : parseBinary(prec + 1); // ^ is right associative
      left = { kind: 'binary', op, left, right };
    }
  }

  function parseUnary(): Expr {
    if (isOp('-')) {
      pos++;
      // Exponentiation binds tighter than unary minus: -a ^ 2 is -(a ^ 2).
      return { kind: 'unary', op: '-', arg: parseBinary(PRECEDENCE['^']) };
    }
    if (isOp('!')) {
      pos++;
      return { kind: 'unary', op: '!', arg: parseUnary() };
    }
    if (isOp('+')) {
      pos++;
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): Expr {
    const t = next();
    if (t.type === 'num') return { kind: 'num', value: t.value };
    if (t.type === 'id') {
      if (isOp('(')) {
        pos++;
        const args: Expr[] = [];
        if (!isOp(')')) {
          args.push(parseTernary());
          while (isOp(',')) {
            pos++;
            args.push(parseTernary());
          }
        }
        expect(')');
        return { kind: 'call', name: t.value, args };
      }
      return { kind: 'var', name: t.value };
    }
    if (t.type === 'op' && t.value === '(') {
      const e = parseTernary();
      expect(')');
      return e;
    }
    throw new ExprError(t.type === 'end' ? 'Unexpected end of expression' : `Unexpected '${(t as { value: string }).value}'`);
  }

  const expr = parseTernary();
  if (peek().type !== 'end') throw new ExprError(`Unexpected '${(peek() as { value: string }).value}'`);
  return expr;
}

const CONSTANTS: Env = { pi: Math.PI, tau: Math.PI * 2, e: Math.E, true: 1, false: 0 };

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  trunc: Math.trunc,
  sqrt: Math.sqrt,
  pow: Math.pow,
  min: Math.min,
  max: Math.max,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sign: Math.sign,
  clamp: (v, lo, hi) => Math.min(Math.max(v, lo), hi),
  lerp: (a, b, t) => a + (b - a) * t,
  mod: (a, b) => ((a % b) + b) % b,
  step: (edge, v) => (v >= edge ? 1 : 0),
  smoothstep: (a, b, v) => {
    const t = Math.min(Math.max((v - a) / (b - a), 0), 1);
    return t * t * (3 - 2 * t);
  },
  /** wrap(v, lo, hi): v wrapped into [lo, hi) */
  wrap: (v, lo, hi) => lo + ((((v - lo) % (hi - lo)) + (hi - lo)) % (hi - lo)),
  exp: Math.exp,
  log: Math.log,
  log2: Math.log2,
  log10: Math.log10,
  cbrt: Math.cbrt,
  hypot: Math.hypot,
  fract: (v) => v - Math.floor(v),
  deg: (rad) => (rad * 180) / Math.PI,
  rad: (deg) => (deg * Math.PI) / 180,
  /** map(v, a, b, c, d): v measured on [a, b] mapped onto [c, d] (not clamped) */
  map: (v, a, b, c, d) => (b === a ? c : c + ((v - a) / (b - a)) * (d - c)),
  /** pingpong(v, len): bounces between 0 and len as v grows */
  pingpong: (v, len) => {
    if (len <= 0) return 0;
    const t = ((v % (len * 2)) + len * 2) % (len * 2);
    return t <= len ? t : len * 2 - t;
  },
  /** ease(t): smooth ease-in-out of t in [0, 1] */
  ease: (t) => {
    const c = Math.min(Math.max(t, 0), 1);
    return c * c * (3 - 2 * c);
  },
};

/** One entry of the formula reference shown in the editor. */
export interface ExprReference {
  /** Signature as typed in a formula, e.g. `clamp(v, lo, hi)`. */
  signature: string;
  label: string;
  /** Name usable for lookups; blank for operator rows. */
  name: string;
}

/** Documentation for every function, constant and operator of the language (for the Variables panel). */
export const EXPR_REFERENCE: ExprReference[] = [
  { name: 'abs', signature: 'abs(v)', label: 'Absolute value' },
  { name: 'sign', signature: 'sign(v)', label: '-1, 0 or 1' },
  { name: 'floor', signature: 'floor(v)', label: 'Round down' },
  { name: 'ceil', signature: 'ceil(v)', label: 'Round up' },
  { name: 'round', signature: 'round(v)', label: 'Round to nearest' },
  { name: 'trunc', signature: 'trunc(v)', label: 'Drop the fraction' },
  { name: 'fract', signature: 'fract(v)', label: 'Fraction part (0 to 1)' },
  { name: 'min', signature: 'min(a, b, …)', label: 'Smallest value' },
  { name: 'max', signature: 'max(a, b, …)', label: 'Largest value' },
  { name: 'clamp', signature: 'clamp(v, lo, hi)', label: 'Limit v to [lo, hi]' },
  { name: 'mod', signature: 'mod(a, b)', label: 'Remainder, always positive for b > 0' },
  { name: 'wrap', signature: 'wrap(v, lo, hi)', label: 'Wrap v into [lo, hi)' },
  { name: 'pingpong', signature: 'pingpong(v, len)', label: 'Bounce between 0 and len' },
  { name: 'lerp', signature: 'lerp(a, b, t)', label: 'Blend a→b by t (0..1)' },
  { name: 'map', signature: 'map(v, a, b, c, d)', label: 'Rescale v from [a, b] to [c, d]' },
  { name: 'step', signature: 'step(edge, v)', label: '1 when v ≥ edge, else 0' },
  { name: 'smoothstep', signature: 'smoothstep(a, b, v)', label: 'Smooth 0→1 as v goes a→b' },
  { name: 'ease', signature: 'ease(t)', label: 'Ease in-out of t (0..1)' },
  { name: 'sqrt', signature: 'sqrt(v)', label: 'Square root' },
  { name: 'cbrt', signature: 'cbrt(v)', label: 'Cube root' },
  { name: 'pow', signature: 'pow(a, b)', label: 'a to the power b (also a ^ b)' },
  { name: 'exp', signature: 'exp(v)', label: 'e to the power v' },
  { name: 'log', signature: 'log(v)', label: 'Natural logarithm' },
  { name: 'log2', signature: 'log2(v)', label: 'Base-2 logarithm' },
  { name: 'log10', signature: 'log10(v)', label: 'Base-10 logarithm' },
  { name: 'hypot', signature: 'hypot(x, y)', label: 'Length of (x, y)' },
  { name: 'sin', signature: 'sin(rad)', label: 'Sine (radians)' },
  { name: 'cos', signature: 'cos(rad)', label: 'Cosine (radians)' },
  { name: 'tan', signature: 'tan(rad)', label: 'Tangent (radians)' },
  { name: 'asin', signature: 'asin(v)', label: 'Inverse sine' },
  { name: 'acos', signature: 'acos(v)', label: 'Inverse cosine' },
  { name: 'atan', signature: 'atan(v)', label: 'Inverse tangent' },
  { name: 'atan2', signature: 'atan2(y, x)', label: 'Angle of (x, y) in radians' },
  { name: 'deg', signature: 'deg(rad)', label: 'Radians → degrees' },
  { name: 'rad', signature: 'rad(deg)', label: 'Degrees → radians' },
  { name: 'pi', signature: 'pi', label: '3.14159…' },
  { name: 'tau', signature: 'tau', label: '2π = 6.28318…' },
  { name: 'e', signature: 'e', label: '2.71828…' },
  { name: '', signature: '+ - * / % ^', label: 'Arithmetic, remainder, power' },
  { name: '', signature: '< <= > >= == !=', label: 'Comparisons give 1 or 0' },
  { name: '', signature: '&& || !', label: 'And, or, not (0 is false)' },
  { name: '', signature: 'cond ? a : b', label: 'a when cond is non-zero, else b' },
];

export function evaluateExpr(expr: Expr, env: Env): number {
  switch (expr.kind) {
    case 'num':
      return expr.value;
    case 'var': {
      if (expr.name in env) return env[expr.name];
      if (expr.name in CONSTANTS) return CONSTANTS[expr.name];
      throw new ExprError(`Unknown variable '${expr.name}'`);
    }
    case 'unary': {
      const v = evaluateExpr(expr.arg, env);
      return expr.op === '-' ? -v : v ? 0 : 1;
    }
    case 'binary': {
      const a = evaluateExpr(expr.left, env);
      if (expr.op === '&&') return a ? (evaluateExpr(expr.right, env) ? 1 : 0) : 0;
      if (expr.op === '||') return a ? 1 : evaluateExpr(expr.right, env) ? 1 : 0;
      const b = evaluateExpr(expr.right, env);
      switch (expr.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return b === 0 ? 0 : a / b;
        case '%':
          return b === 0 ? 0 : a % b;
        case '^':
          return Math.pow(a, b);
        case '<':
          return a < b ? 1 : 0;
        case '<=':
          return a <= b ? 1 : 0;
        case '>':
          return a > b ? 1 : 0;
        case '>=':
          return a >= b ? 1 : 0;
        case '==':
          return a === b ? 1 : 0;
        case '!=':
          return a !== b ? 1 : 0;
        default:
          throw new ExprError(`Unknown operator ${expr.op}`);
      }
    }
    case 'cond':
      return evaluateExpr(expr.test, env) ? evaluateExpr(expr.yes, env) : evaluateExpr(expr.no, env);
    case 'call': {
      const fn = FUNCTIONS[expr.name];
      if (!fn) throw new ExprError(`Unknown function '${expr.name}'`);
      return fn(...expr.args.map((a) => evaluateExpr(a, env)));
    }
  }
}

const cache = new Map<string, Expr | ExprError>();

/** Parse (cached) and evaluate. Throws ExprError on bad syntax or unknown names. */
export function evaluate(src: string, env: Env): number {
  let parsed = cache.get(src);
  if (!parsed) {
    try {
      parsed = parseExpr(src);
    } catch (err) {
      parsed = err instanceof ExprError ? err : new ExprError(String(err));
    }
    if (cache.size > 500) cache.clear();
    cache.set(src, parsed);
  }
  if (parsed instanceof ExprError) throw parsed;
  const v = evaluateExpr(parsed, env);
  return Number.isFinite(v) ? v : 0;
}

/** Names referenced by an expression (for dependency checks). */
export function referencedNames(src: string): string[] {
  const out = new Set<string>();
  const walk = (e: Expr) => {
    switch (e.kind) {
      case 'var':
        out.add(e.name);
        break;
      case 'unary':
        walk(e.arg);
        break;
      case 'binary':
        walk(e.left);
        walk(e.right);
        break;
      case 'cond':
        walk(e.test);
        walk(e.yes);
        walk(e.no);
        break;
      case 'call':
        e.args.forEach(walk);
        break;
      default:
        break;
    }
  };
  try {
    walk(parseExpr(src));
  } catch {
    /* invalid expression: no references */
  }
  return [...out];
}

export const EXPR_FUNCTION_NAMES = Object.keys(FUNCTIONS);
