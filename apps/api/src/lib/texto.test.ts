import { normalizar } from './texto';

describe('normalizar', () => {
  it('quita tildes, pasa a minúsculas y recorta', () => {
    expect(normalizar('  Puré ÑOQUIS ')).toBe('pure noquis');
  });

  it('deja los caracteres especiales como están', () => {
    expect(normalizar('50%_off')).toBe('50%_off');
  });
});
