import type { Rol, RolInput } from '@pgim/shared';
import type { RolRepository } from '../repositories/rol.repository';
import { createRolService } from './rol.service';

const R = 'restaurante';

const admin: Rol = {
  id: 'admin',
  nombre: 'Administrador',
  arquetipo: 'OTRO',
  predeterminado: true,
  activo: true,
  permisos: ['rol.ver', 'rol.editar'],
  cantidadEmpleados: 0,
};

const mozo: Rol = { ...admin, id: 'mozo', nombre: 'Mozo', permisos: ['pedido.ver'] };

function repoFalso(rol: Rol, gestores = 1): jest.Mocked<RolRepository> {
  return {
    listar: jest.fn(),
    buscar: jest.fn().mockResolvedValue(rol),
    existeNombre: jest.fn().mockResolvedValue(false),
    crear: jest.fn(),
    actualizar: jest.fn().mockResolvedValue(rol),
    desactivar: jest.fn(),
    contarGestoresDeRoles: jest.fn().mockResolvedValue(gestores),
  };
}

const input = (rol: Rol, cambios: Partial<RolInput> = {}): RolInput => ({
  nombre: rol.nombre,
  arquetipo: rol.arquetipo,
  permisos: rol.permisos,
  ...cambios,
});

describe('rolService', () => {
  it('E1: rechaza un nombre repetido', async () => {
    const repo = repoFalso(mozo);
    repo.existeNombre.mockResolvedValue(true);

    await expect(createRolService(repo).crear(R, input(mozo))).rejects.toMatchObject({
      status: 409,
    });
  });

  it('E2: no deja quitar rol.editar si nadie más lo tiene', async () => {
    const repo = repoFalso(admin, 0);

    await expect(
      createRolService(repo).actualizar(R, 'admin', input(admin, { permisos: ['rol.ver'] })),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.contarGestoresDeRoles).toHaveBeenCalledWith(R, { rolId: 'admin' });
    expect(repo.actualizar).not.toHaveBeenCalled();
  });

  it('E2: tampoco deja quitar rol.ver, porque sin él nadie abre la pantalla de roles', async () => {
    const repo = repoFalso(admin, 0);

    await expect(
      createRolService(repo).actualizar(R, 'admin', input(admin, { permisos: ['rol.editar'] })),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('E2: deja quitarlo si otro usuario conserva la gestión de roles', async () => {
    const repo = repoFalso(admin, 1);

    await createRolService(repo).actualizar(R, 'admin', input(admin, { permisos: ['rol.ver'] }));

    expect(repo.actualizar).toHaveBeenCalled();
  });

  it('E2: no consulta gestores si el rol no gestionaba roles', async () => {
    const repo = repoFalso(mozo, 0);

    await createRolService(repo).actualizar(R, 'mozo', input(mozo, { nombre: 'Camarero' }));

    expect(repo.contarGestoresDeRoles).not.toHaveBeenCalled();
  });

  it('B: no da de baja un rol con empleados activos', async () => {
    const repo = repoFalso({ ...mozo, cantidadEmpleados: 2 });

    await expect(createRolService(repo).desactivar(R, 'mozo')).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('reasignalos'),
    });
    expect(repo.desactivar).not.toHaveBeenCalled();
  });

  it('B: tampoco por edición con activo en false', async () => {
    const repo = repoFalso({ ...mozo, cantidadEmpleados: 1 });

    await expect(
      createRolService(repo).actualizar(R, 'mozo', input(mozo, { activo: false })),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('da de baja un rol sin empleados', async () => {
    const repo = repoFalso(mozo);

    await createRolService(repo).desactivar(R, 'mozo');

    expect(repo.desactivar).toHaveBeenCalledWith(R, 'mozo');
  });

  it('agrupa el catálogo de permisos por módulo', () => {
    const grupos = createRolService(repoFalso(mozo)).permisosPorModulo();

    expect(grupos.find((g) => g.modulo === 'rol')?.permisos.map((p) => p.accion)).toEqual([
      'ver',
      'crear',
      'editar',
      'eliminar',
    ]);
  });
});
