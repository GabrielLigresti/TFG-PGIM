import {
  CONFIGURACION_APERTURA_POR_DEFECTO,
  PERMISOS,
  ROLES_PREDETERMINADOS,
  type RegistroRestaurante,
} from '@pgim/shared';
import { camposDeClaveDuplicada } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { limpiarBase } from '../test/db-setup';
import { restauranteRepository, type AltaRestaurante } from './restaurante.repository';

afterAll(() => prisma.$disconnect());

const sucursal: RegistroRestaurante['sucursal'] = {
  nombre: 'Casa central',
  direccion: 'Calle Falsa 123',
  barrio: 'SAN_NICOLAS',
  horarioApertura: '12:00',
  horarioCierre: '23:30',
  toleranciaNoShowMin: 15,
  horariosServicio: [
    { franja: 'ALMUERZO', horaInicio: '12:00', horaFin: '16:00' },
    { franja: 'CENA', horaInicio: '20:00', horaFin: '23:30' },
  ],
};

const alta = (cambios: Partial<AltaRestaurante> = {}): AltaRestaurante => ({
  restaurante: { nombre: 'Restaurante nuevo', cuit: '30712345678' },
  sucursal,
  administrador: { nombreCompleto: 'Ana Pérez', email: 'ana@prueba.test', passwordHash: 'hash' },
  ...cambios,
});

const cargarCatalogo = () =>
  prisma.permiso.createMany({
    data: PERMISOS.map(({ codigo, modulo, accion }) => ({ codigo, modulo, accion })),
  });

describe('restauranteRepository.registrar', () => {
  beforeEach(limpiarBase);

  it('crea restaurante, sucursal, roles, administrador y su asignación', async () => {
    await cargarCatalogo();

    const { usuarioId, sucursalId } = await restauranteRepository.registrar(alta());

    const empleado = await prisma.empleado.findUniqueOrThrow({
      where: { usuarioId },
      include: {
        usuario: true,
        rol: { include: { permisos: true } },
        sucursales: true,
        restaurante: { include: { roles: true } },
      },
    });
    expect(empleado.usuario).toMatchObject({ tipo: 'EMPLEADO', activo: true });
    expect(empleado).toMatchObject({ nombreCompleto: 'Ana Pérez', horasSemanalesMax: 48 });
    expect(empleado.restaurante).toMatchObject({
      nombre: 'Restaurante nuevo',
      cuit: '30712345678',
    });
    expect(empleado.sucursales).toEqual([{ empleadoId: usuarioId, sucursalId }]);
    expect(empleado.rol.nombre).toBe(ROLES_PREDETERMINADOS[0]!.nombre);
    expect(empleado.rol.permisos).toHaveLength(PERMISOS.length);
    expect(empleado.restaurante.roles.map((r) => r.nombre).sort()).toEqual(
      ROLES_PREDETERMINADOS.map((r) => r.nombre).sort(),
    );
    expect(empleado.restaurante.roles.every((r) => r.predeterminado)).toBe(true);

    const fila = await prisma.sucursal.findUniqueOrThrow({
      where: { id: sucursalId },
      include: { horariosServicio: true, configuracionApertura: true },
    });
    expect(fila).toMatchObject({ restauranteId: empleado.restauranteId, nombre: 'Casa central' });
    expect(fila.menuActivoId).toBeNull();
    expect(fila.horariosServicio).toHaveLength(2);
    expect(fila.configuracionApertura).toMatchObject({
      semanasHistoricoMinimo: CONFIGURACION_APERTURA_POR_DEFECTO.semanasHistoricoMinimo,
    });
    expect(Number(fila.configuracionApertura!.cubiertosPorMozo)).toBe(
      CONFIGURACION_APERTURA_POR_DEFECTO.cubiertosPorMozo,
    );
  });

  it('con un email repetido falla y no deja restaurante ni sucursal', async () => {
    await cargarCatalogo();
    await restauranteRepository.registrar(alta());

    const error = await restauranteRepository
      .registrar(alta({ restaurante: { nombre: 'Otro', cuit: '30799999999' } }))
      .catch((e: unknown) => e);

    expect(camposDeClaveDuplicada(error).join(' ')).toContain('email');
    expect(await prisma.restaurante.count()).toBe(1);
    expect(await prisma.sucursal.count()).toBe(1);
    expect(await prisma.rol.count()).toBe(ROLES_PREDETERMINADOS.length);
  });

  it('con un CUIT repetido informa el campo cuit', async () => {
    await cargarCatalogo();
    await restauranteRepository.registrar(alta());

    const error = await restauranteRepository
      .registrar(
        alta({
          administrador: { nombreCompleto: 'Otra', email: 'otra@prueba.test', passwordHash: 'h' },
        }),
      )
      .catch((e: unknown) => e);

    expect(camposDeClaveDuplicada(error).join(' ')).toContain('cuit');
    expect(await prisma.usuario.count()).toBe(1);
  });

  it('con el catálogo de permisos incompleto falla y no deja nada', async () => {
    await expect(restauranteRepository.registrar(alta())).rejects.toMatchObject({ status: 500 });
    expect(await prisma.restaurante.count()).toBe(0);
    expect(await prisma.sucursal.count()).toBe(0);
  });
});
