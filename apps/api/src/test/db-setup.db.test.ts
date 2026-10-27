import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase } from './db-setup';

afterAll(() => prisma.$disconnect());

describe('escenario de la base de prueba', () => {
  it('arranca con harina y queso en stock', async () => {
    await limpiarBase();
    const e = await crearEscenario();
    const existencias = await prisma.existencia.findMany();
    expect(existencias).toHaveLength(2);
    const harina = existencias.find((x) => x.componenteId === e.harinaId)!;
    expect(Number(harina.cantidadActual)).toBe(1000);
  });
});
