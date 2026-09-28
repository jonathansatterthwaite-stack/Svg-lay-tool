/**
 * A small, safe expression language for variable bindings. No eval: the
 * source is tokenised and parsed into an AST, then evaluated against an
 * environment of numbers.
 *
 * Supported: numbers, identifiers, + - * / % ^, unary - and !, comparisons
 * (< <= > >= == !=), && ||, `cond ? a : b`, parentheses, and functions:
 * abs, floor, ceil, round, trunc, sqrt, pow, min, max, clamp, lerp, mod,
 * sin, cos, tan, asin, acos, atan, atan2, sign, step, smoothstep, wrap.
 * Booleans are 1 and 0. Constants: pi, e, true, false.
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

const CONSTANTS: Env = { pi: Math.PI, e: Math.E, true: 1, false: 0 };

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
};

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
