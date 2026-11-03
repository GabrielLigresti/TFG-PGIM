import { crearPrng } from './prng';

describe('crearPrng', () => {
  it('con la misma semilla repite la secuencia, dentro de [0, 1)', () => {
    const a = crearPrng(7);
    const b = crearPrng(7);
    const xs = Array.from({ length: 50 }, () => a());

    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(crearPrng(8)()).not.toBe(xs[0]);
  });
});
