import { BARRIOS, barrioSchema, nombreBarrio } from '@pgim/shared';
import { Barrio } from '../generated/prisma/enums';

// La lista visible vive en shared (sin Prisma); este test la ata al enum del schema.
describe('BARRIOS', () => {
  it('tiene los 48 barrios oficiales de CABA', () => {
    expect(BARRIOS).toHaveLength(48);
  });

  it('coincide exactamente con el enum Barrio del schema', () => {
    expect(BARRIOS.map((b) => b.valor).sort()).toEqual(Object.values(Barrio).sort());
  });

  it('está ordenada por nombre visible', () => {
    const nombres = BARRIOS.map((b) => b.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('da el nombre visible con tildes', () => {
    expect(nombreBarrio('NUNEZ')).toBe('Núñez');
    expect(nombreBarrio('VILLA_GRAL_MITRE')).toBe('Villa General Mitre');
  });

  it('rechaza un barrio fuera de la lista', () => {
    expect(barrioSchema.safeParse('GOTHAM').success).toBe(false);
    expect(barrioSchema.safeParse('PALERMO').success).toBe(true);
  });
});
