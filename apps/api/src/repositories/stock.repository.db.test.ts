import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';

afterAll(() => prisma.$disconnect());

// Restricciones de la migración de intermedios con stock (der/convenciones.md).
describe('CHECK de stock y producción', () => {
  let e: Escenario;
  let existenciaId: string;

  beforeAll(async () => {
    await limpiarBase();
    e = await crearEscenario();
    existenciaId = (
      await prisma.existencia.findFirstOrThrow({
        where: { sucursalId: e.sucursalId, componenteId: e.harinaId },
      })
    ).id;
  });

  const movimiento = (datos: object) =>
    prisma.movimientoStock.create({
      data: { existenciaId, cantidad: -1, costoUnitario: 0, tipo: 'AJUSTE', motivo: 'x', ...datos },
    });

  it('la base rechaza lleva_stock en un insumo', async () => {
    await expect(
      prisma.componenteInventario.update({ where: { id: e.harinaId }, data: { llevaStock: true } }),
    ).rejects.toThrow(/componente_lleva_stock_ck/);
  });

  it('la base rechaza una merma sin motivo', async () => {
    await expect(movimiento({ tipo: 'MERMA' })).rejects.toThrow(/movimiento_motivo_merma_ck/);
  });

  it('la base rechaza un motivo de merma en otro tipo de movimiento', async () => {
    await expect(movimiento({ tipo: 'AJUSTE', motivoMerma: 'OTRO' })).rejects.toThrow(
      /movimiento_motivo_merma_ck/,
    );
  });

  it('la base rechaza una producción sin tanda', async () => {
    await expect(movimiento({ tipo: 'PRODUCCION', cantidad: 1 })).rejects.toThrow(
      /movimiento_tanda_ck/,
    );
  });

  it('la base rechaza cantidad_teorica en un ingreso', async () => {
    await expect(movimiento({ tipo: 'INGRESO', cantidad: 1, cantidadTeorica: 1 })).rejects.toThrow(
      /movimiento_cantidad_teorica_ck/,
    );
  });

  it('la base acepta una merma con motivo', async () => {
    await expect(movimiento({ tipo: 'MERMA', motivoMerma: 'VENCIMIENTO' })).resolves.toBeTruthy();
  });
});
