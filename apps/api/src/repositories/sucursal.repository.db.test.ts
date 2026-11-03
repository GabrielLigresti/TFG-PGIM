import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import { sucursalRepository } from './sucursal.repository';

afterAll(() => prisma.$disconnect());

let e: Escenario;

beforeEach(async () => {
  await limpiarBase();
  e = await crearEscenario();
});

async function crearEmpleado() {
  const rol = await prisma.rol.create({
    data: { restauranteId: e.restauranteId, nombre: 'Encargado', arquetipo: 'OTRO' },
  });
  const usuario = await prisma.usuario.create({
    data: { email: `encargado-${Date.now()}@prueba.test`, passwordHash: 'x', tipo: 'EMPLEADO' },
  });
  await prisma.empleado.create({
    data: {
      usuarioId: usuario.id,
      restauranteId: e.restauranteId,
      rolId: rol.id,
      nombreCompleto: 'Encargado de prueba',
      horasSemanalesMax: 40,
    },
  });
  return usuario.id;
}

describe('sucursalRepository.crear', () => {
  it('deja la configuración de apertura por defecto', async () => {
    const empleadoId = await crearEmpleado();
    const sucursal = await sucursalRepository.crear(
      e.restauranteId,
      {
        nombre: 'Norte',
        direccion: 'Calle Falsa 456',
        horarioApertura: '12:00',
        horarioCierre: '23:00',
        toleranciaNoShowMin: 15,
        horariosServicio: [{ franja: 'ALMUERZO', horaInicio: '12:00', horaFin: '16:00' }],
      },
      empleadoId,
    );
    const config = await prisma.configuracionApertura.findUniqueOrThrow({
      where: { sucursalId: sucursal.id },
    });
    expect(config.semanasHistoricoMinimo).toBe(8);
    expect(Number(config.cubiertosPorMozo)).toBe(20);
    expect(Number(config.platosPorCocineroHora)).toBe(12);
  });
});

describe('migración configuracion_apertura_por_defecto', () => {
  const sql = readFileSync(
    join(
      __dirname,
      '../../prisma/migrations/20261103120000_configuracion_apertura_por_defecto/migration.sql',
    ),
    'utf8',
  );

  it('completa las sucursales sin configuración y respeta las que ya tienen', async () => {
    await prisma.configuracionApertura.deleteMany();
    const otra = await prisma.sucursal.create({
      data: {
        ...(await prisma.sucursal.findUniqueOrThrow({ where: { id: e.sucursalId } })),
        id: undefined,
        nombre: 'Sur',
      },
    });
    await prisma.configuracionApertura.create({
      data: {
        sucursalId: otra.id,
        semanasHistoricoMinimo: 10,
        cubiertosPorMozo: 7,
        platosPorCocineroHora: 9,
      },
    });

    await prisma.$executeRawUnsafe(sql);
    await prisma.$executeRawUnsafe(sql); // idempotente

    const propia = await prisma.configuracionApertura.findUniqueOrThrow({
      where: { sucursalId: e.sucursalId },
    });
    expect(propia.semanasHistoricoMinimo).toBe(8);
    expect(Number(propia.cubiertosPorMozo)).toBe(20);
    const intacta = await prisma.configuracionApertura.findUniqueOrThrow({
      where: { sucursalId: otra.id },
    });
    expect(Number(intacta.cubiertosPorMozo)).toBe(7);
  });
});
