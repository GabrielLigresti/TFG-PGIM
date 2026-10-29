import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import { contextoMesa, elegibilidad } from './elegibilidad';

afterAll(() => prisma.$disconnect());

let e: Escenario;

beforeEach(async () => {
  await limpiarBase();
  e = await crearEscenario();
});

async function pagoAprobado(fecha: Date, monto: number, beneficioId?: string) {
  const pago = await prisma.pago.create({
    data: {
      cuentaMesaId: e.cuentaMesaId,
      comensalId: e.comensalId,
      monto,
      metodo: 'TARJETA',
      estado: 'APROBADO',
      fecha,
    },
  });
  if (beneficioId) {
    await prisma.beneficioAplicado.create({
      data: { pagoId: pago.id, beneficioId, montoDescontado: 1 },
    });
  }
  return pago;
}

describe('contextoMesa', () => {
  it('no devuelve la mesa de otro comensal', async () => {
    const otro = await prisma.usuario.create({
      data: { email: 'otro@prueba.test', passwordHash: 'x', tipo: 'COMENSAL' },
    });
    expect(await contextoMesa(prisma, otro.id, e.cuentaMesaId)).toBeNull();
  });

  it('marca la mesa que ya usó un beneficio en un pago aprobado', async () => {
    const b = await prisma.beneficio.create({
      data: {
        restauranteId: e.restauranteId,
        nombre: 'Postre',
        clase: 'RECOMPENSA',
        criterioTipo: 'VISITAS',
        criterioValor: 1,
        tipoDescuento: 'PORCENTAJE',
        valor: 10,
        vigenciaDesde: new Date('2026-01-01T00:00:00Z'),
        vigenciaHasta: new Date('2027-01-01T00:00:00Z'),
      },
    });
    expect(await contextoMesa(prisma, e.comensalId, e.cuentaMesaId)).toMatchObject({
      restauranteId: e.restauranteId,
      menuActivoId: e.menuId,
      beneficioUsado: false,
    });
    await pagoAprobado(new Date(), 100, b.id);
    expect(await contextoMesa(prisma, e.comensalId, e.cuentaMesaId)).toMatchObject({
      beneficioUsado: true,
    });
  });
});

describe('elegibilidad', () => {
  it('después de un canje, cuenta solo lo posterior', async () => {
    const vigenciaDesde = new Date('2026-11-01T00:00:00Z');
    const b = await prisma.beneficio.create({
      data: {
        restauranteId: e.restauranteId,
        nombre: 'Gastá $20.000',
        clase: 'RECOMPENSA',
        criterioTipo: 'MONTO',
        criterioValor: 20000,
        tipoDescuento: 'PORCENTAJE',
        valor: 10,
        vigenciaDesde,
        vigenciaHasta: new Date('2026-12-01T00:00:00Z'),
      },
    });
    await pagoAprobado(new Date('2026-10-20T12:00:00Z'), 5000); // antes de la vigencia
    await pagoAprobado(new Date('2026-11-02T12:00:00Z'), 20000);
    const antes = await elegibilidad(prisma, e.comensalId, e.restauranteId, [
      { id: b.id, vigenciaDesde },
    ]);
    expect(antes.porBeneficio.get(b.id)).toEqual({
      datos: { visitas: 0, montoGastado: 20000, puntos: 0, tienePagosAprobados: true },
      canjeadoEnEdicion: false,
    });

    await pagoAprobado(new Date('2026-11-05T12:00:00Z'), 18000, b.id); // el canje
    await pagoAprobado(new Date('2026-11-06T12:00:00Z'), 7000);
    const despues = await elegibilidad(prisma, e.comensalId, e.restauranteId, [
      { id: b.id, vigenciaDesde },
    ]);
    expect(despues.porBeneficio.get(b.id)).toMatchObject({
      datos: { montoGastado: 7000 },
      canjeadoEnEdicion: true,
    });
  });
});
