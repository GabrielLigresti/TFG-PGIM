import { PERMISOS, ROLES_PREDETERMINADOS } from '@pgim/shared';
import { prisma } from '../lib/prisma';
import { limpiarBase } from '../test/db-setup';
import { crearRolesPredeterminados } from './roles-predeterminados';

afterAll(() => prisma.$disconnect());

const cargarCatalogo = () =>
  prisma.permiso.createMany({
    data: PERMISOS.map(({ codigo, modulo, accion }) => ({ codigo, modulo, accion })),
  });

const nuevoRestaurante = () =>
  prisma.restaurante.create({ data: { nombre: 'Restaurante de prueba', cuit: '30-1-9' } });

describe('crearRolesPredeterminados', () => {
  beforeEach(limpiarBase);

  it('crea los roles predeterminados con sus permisos y devuelve los ids por nombre', async () => {
    await cargarCatalogo();
    const { id: restauranteId } = await nuevoRestaurante();

    const ids = await prisma.$transaction((tx) => crearRolesPredeterminados(tx, restauranteId));

    expect([...ids.keys()].sort()).toEqual(ROLES_PREDETERMINADOS.map((r) => r.nombre).sort());
    for (const rol of ROLES_PREDETERMINADOS) {
      const fila = await prisma.rol.findUniqueOrThrow({
        where: { id: ids.get(rol.nombre)! },
        include: { permisos: { include: { permiso: true } } },
      });
      expect(fila).toMatchObject({ restauranteId, arquetipo: rol.arquetipo, predeterminado: true });
      expect(fila.permisos.map((p) => p.permiso.codigo).sort()).toEqual([...rol.permisos].sort());
    }
  });

  it('los roles que reciben turnos en la planificación pueden verlos', () => {
    const conTurnos = ROLES_PREDETERMINADOS.filter((r) =>
      ['MOZO', 'COCINERO'].includes(r.arquetipo),
    );
    expect(conTurnos.length).toBeGreaterThan(0);
    for (const rol of conTurnos) expect(rol.permisos).toContain('turno.ver');
  });

  it('es idempotente: repetirla no duplica roles ni permisos', async () => {
    await cargarCatalogo();
    const { id: restauranteId } = await nuevoRestaurante();
    await prisma.$transaction((tx) => crearRolesPredeterminados(tx, restauranteId));
    await prisma.$transaction((tx) => crearRolesPredeterminados(tx, restauranteId));

    expect(await prisma.rol.count({ where: { restauranteId } })).toBe(ROLES_PREDETERMINADOS.length);
    const esperados = ROLES_PREDETERMINADOS.reduce((n, r) => n + r.permisos.length, 0);
    expect(await prisma.rolPermiso.count()).toBe(esperados);
  });

  it('falla con un catálogo incompleto y no deja nada creado', async () => {
    await cargarCatalogo();
    await prisma.permiso.delete({ where: { codigo: ROLES_PREDETERMINADOS[0]!.permisos[0]! } });
    const { id: restauranteId } = await nuevoRestaurante();

    await expect(
      prisma.$transaction((tx) => crearRolesPredeterminados(tx, restauranteId)),
    ).rejects.toMatchObject({ status: 500, message: 'El catálogo de permisos no está cargado' });
    expect(await prisma.rol.count({ where: { restauranteId } })).toBe(0);
  });
});
