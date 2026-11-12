import { prisma } from '../lib/prisma';
import { crearEscenario, limpiarBase, type Escenario } from '../test/db-setup';
import { cuentaRepository } from './cuenta.repository';

afterAll(() => prisma.$disconnect());

let e: Escenario;

beforeEach(async () => {
  await limpiarBase();
  e = await crearEscenario();
});

async function crearEmpleado() {
  const rol = await prisma.rol.create({
    data: { restauranteId: e.restauranteId, nombre: 'Mozo', arquetipo: 'OTRO' },
  });
  const usuario = await prisma.usuario.create({
    data: { email: `mozo-${Date.now()}@prueba.test`, passwordHash: 'x', tipo: 'EMPLEADO' },
  });
  await prisma.empleado.create({
    data: {
      usuarioId: usuario.id,
      restauranteId: e.restauranteId,
      rolId: rol.id,
      nombreCompleto: 'Mozo de prueba',
      horasSemanalesMax: 40,
    },
  });
  return usuario.id;
}

describe('cuentaRepository: empleado', () => {
  it('actualizarEmpleado con otro restauranteId no modifica la fila', async () => {
    const id = await crearEmpleado();
    const otro = await crearEscenario();

    expect(
      await cuentaRepository.actualizarEmpleado(id, otro.restauranteId, {
        nombreCompleto: 'Intruso',
      }),
    ).toBe(false);
    expect(
      await cuentaRepository.guardarFotoEmpleado(
        id,
        otro.restauranteId,
        '/api/uploads/fotos/x.png',
      ),
    ).toBe(false);
    const fila = await prisma.empleado.findUniqueOrThrow({ where: { usuarioId: id } });
    expect(fila.nombreCompleto).toBe('Mozo de prueba');
    expect(fila.fotoUrl).toBeNull();
  });

  it('con su restauranteId actualiza el nombre y la foto, y findEmpleado trae el rol', async () => {
    const id = await crearEmpleado();

    expect(
      await cuentaRepository.actualizarEmpleado(id, e.restauranteId, { nombreCompleto: 'Nuevo' }),
    ).toBe(true);
    await cuentaRepository.guardarFotoEmpleado(id, e.restauranteId, '/api/uploads/fotos/x.png');

    const datos = await cuentaRepository.findEmpleado(id, e.restauranteId);
    expect(datos).toMatchObject({
      nombreCompleto: 'Nuevo',
      fotoUrl: '/api/uploads/fotos/x.png',
      rol: 'Mozo',
    });
    expect(
      await cuentaRepository.findEmpleado(id, (await crearEscenario()).restauranteId),
    ).toBeNull();
  });
});

describe('cuentaRepository: comensal y contraseña', () => {
  it('actualizarComensal persiste telefono null', async () => {
    await prisma.comensal.update({
      where: { usuarioId: e.comensalId },
      data: { telefono: '1155' },
    });

    await cuentaRepository.actualizarComensal(e.comensalId, { nombre: 'Cora', telefono: null });

    const fila = await prisma.comensal.findUniqueOrThrow({ where: { usuarioId: e.comensalId } });
    expect(fila).toMatchObject({ nombre: 'Cora', telefono: null });
    expect(await cuentaRepository.findComensal(e.comensalId)).toMatchObject({
      nombre: 'Cora',
      telefono: null,
    });
  });

  it('guardarPasswordHash cambia el hash solo de ese usuario', async () => {
    const id = await crearEmpleado();

    await cuentaRepository.guardarPasswordHash(id, 'nuevo-hash');

    expect(await cuentaRepository.findPasswordHash(id)).toEqual({ passwordHash: 'nuevo-hash' });
    expect(await cuentaRepository.findPasswordHash(e.comensalId)).toEqual({ passwordHash: 'x' });
  });
});

describe('cuentaRepository: cuentas sin contraseña', () => {
  it('findComensal informa tieneContrasena según el hash', async () => {
    const sin = await prisma.usuario.create({
      data: {
        email: `sin-${Date.now()}@prueba.test`,
        passwordHash: null,
        tipo: 'COMENSAL',
        comensal: { create: { nombre: 'Sin clave' } },
      },
    });
    expect((await cuentaRepository.findComensal(sin.id))?.tieneContrasena).toBe(false);
    expect((await cuentaRepository.findComensal(e.comensalId))?.tieneContrasena).toBe(true);
  });

  it('findPasswordHash distingue inexistente de sin hash', async () => {
    const sin = await prisma.usuario.create({
      data: { email: `sin2-${Date.now()}@prueba.test`, passwordHash: null, tipo: 'COMENSAL' },
    });
    expect(await cuentaRepository.findPasswordHash(sin.id)).toEqual({ passwordHash: null });
    expect(
      await cuentaRepository.findPasswordHash('01900000-0000-7000-8000-0000000000ff'),
    ).toBeNull();
  });
});
