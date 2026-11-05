import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase } from '../test/db-setup';
import { comensalRepository } from './comensal.repository';

afterAll(() => prisma.$disconnect());

beforeEach(limpiarBase);

describe('comensalRepository.listarSucursales', () => {
  it('trae las sucursales activas de todos los restaurantes, con barrio y solo los campos públicos', async () => {
    const a = await crearEscenario();
    const b = await crearEscenario();
    const base = await prisma.sucursal.findUniqueOrThrow({ where: { id: a.sucursalId } });
    await prisma.sucursal.create({
      data: {
        restauranteId: a.restauranteId,
        nombre: 'Cerrada',
        direccion: 'Calle Cerrada 1',
        barrio: 'BELGRANO',
        activa: false,
        horarioApertura: base.horarioApertura,
        horarioCierre: base.horarioCierre,
        toleranciaNoShowMin: 15,
      },
    });
    await prisma.sucursal.update({
      where: { id: b.sucursalId },
      data: { barrio: 'VILLA_CRESPO' },
    });

    const restaurantes = await comensalRepository.listarSucursales();

    expect(restaurantes.map((r) => r.id).sort()).toEqual([a.restauranteId, b.restauranteId].sort());
    const sucursales = restaurantes.flatMap((r) => r.sucursales);
    expect(sucursales).toHaveLength(2);
    expect(sucursales.map((s) => s.nombre)).not.toContain('Cerrada');
    for (const s of sucursales) {
      expect(Object.keys(s).sort()).toEqual(['barrio', 'direccion', 'id', 'nombre']);
    }
    const deB = restaurantes.find((r) => r.id === b.restauranteId)!;
    expect(deB.sucursales[0]!.barrio).toBe('VILLA_CRESPO');
  });
});
