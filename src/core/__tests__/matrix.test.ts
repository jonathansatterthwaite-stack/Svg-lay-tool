import { describe, expect, it } from 'vitest';
import { applyToPoint, compose, invert, multiply, rotate, scale, translate, transformRect } from '../matrix';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('matrix', () => {
  it('applies translate/rotate/scale in SVG order', () => {
    const m = compose(translate(10, 20), rotate(90), scale(2));
    const p = applyToPoint(m, { x: 1, y: 0 });
    // scale -> (2,0); rotate 90 cw -> (0,2); translate -> (10,22)
    close(p.x, 10);
    close(p.y, 22);
  });

  it('inverts', () => {
    const m = compose(translate(-5, 7), rotate(33), scale(1.5, -2));
    const inv = invert(m);
    const id = multiply(m, inv);
    close(id.a, 1);
    close(id.b, 0);
    close(id.c, 0);
    close(id.d, 1);
    close(id.e, 0);
    close(id.f, 0);
  });

  it('bounds a rotated rect', () => {
    const r = transformRect({ x: -10, y: -10, width: 20, height: 20 }, rotate(45));
    const d = 20 * Math.SQRT2;
    close(r.width, d);
    close(r.height, d);
    close(r.x, -d / 2);
  });
});
