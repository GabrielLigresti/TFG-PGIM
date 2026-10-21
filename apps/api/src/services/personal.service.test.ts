import type { Empleado, EmpleadoAlta, EmpleadoEdicion } from '@pgim/shared';
import type { PersonalRepository, RolAsignable } from '../repositories/personal.repository';
import { createPersonalService } from './personal.service';

const R = 'restaurante';

const rolAdmin: RolAsignable = { id: 'admin', activo: true, permisos: ['rol.editar'] };
const rolMozo: RolAsignable = { id: 'mozo', activo: true, permisos: ['pedido.ver'] };

const ana: Empleado = {
  id: 'ana',
  email: 'ana@demo.test',
  nombreCompleto: 'Ana',
  rol: { id: 'admin', nombre: 'Administrador' },
  sucursales: [{ id: 'centro', nombre: 'Centro' }],
  horasSemanalesMax: 48,
  activo: true,
};

const alta: EmpleadoAlta = {
  email: 'nuevo@demo.test',
  password: 'secreta123',
  nombreCompleto: 'Nuevo',
  rolId: 'mozo',
  sucursalIds: ['centro'],
  horasSemanalesMax: 40,
};

const edicion = (cambios: Partial<EmpleadoEdicion> = {}): EmpleadoEdicion => ({
  nombreCompleto: 'Ana',
  rolId: 'admin',
  sucursalIds: ['centro'],
  horasSemanalesMax: 48,
  ...cambios,
});

function repoFalso(gestores = 1): jest.Mocked<PersonalRepository> {
  const roles = new Map([
    ['admin', rolAdmin],
    ['mozo', rolMozo],
  ]);
  return {
    listar: jest.fn(),
    buscar: jest.fn().mockResolvedValue(ana),
    emailRegistrado: jest.fn().mockResolvedValue(false),
    buscarRol: jest.fn(async (_r: string, id: string) => roles.get(id) ?? null),
    contarSucursalesActivas: jest.fn(async (_r: string, ids: string[]) => ids.length),
    crear: jest.fn().mockResolvedValue(ana),
    actualizar: jest.fn().mockResolvedValue(ana),
    desactivar: jest.fn(),
    contarGestoresDeRoles: jest.fn().mockResolvedValue(gestores),
  };
}

describe('personalService', () => {
  it('da de alta guardando la contraseña hasheada', async () => {
    const repo = repoFalso();

    await createPersonalService(repo).crear(R, alta);

    const [, datos, hash] = repo.crear.mock.calls[0]!;
    expect(datos).not.toHaveProperty('password');
    expect(hash).toMatch(/^scrypt\$/);
  });

  it('rechaza un email ya registrado', async () => {
    const repo = repoFalso();
    repo.emailRegistrado.mockResolvedValue(true);

    await expect(createPersonalService(repo).crear(R, alta)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('rechaza un rol de otro restaurante', async () => {
    await expect(
      createPersonalService(repoFalso()).crear(R, { ...alta, rolId: 'ajeno' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rechaza una sucursal ajena o dada de baja', async () => {
    const repo = repoFalso();
    repo.contarSucursalesActivas.mockResolvedValue(0);

    await expect(createPersonalService(repo).crear(R, alta)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('no deja darse de baja a uno mismo', async () => {
    const repo = repoFalso();

    await expect(createPersonalService(repo).desactivar(R, 'ana', 'ana')).rejects.toMatchObject({
      status: 409,
    });
    expect(repo.desactivar).not.toHaveBeenCalled();
  });

  it('E2: no deja sacarle al único gestor su rol de administrador', async () => {
    const repo = repoFalso(0);

    await expect(
      createPersonalService(repo).actualizar(R, 'otro', 'ana', edicion({ rolId: 'mozo' })),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.contarGestoresDeRoles).toHaveBeenCalledWith(R, { usuarioId: 'ana' });
  });

  it('E2: no deja dar de baja al único gestor', async () => {
    await expect(
      createPersonalService(repoFalso(0)).desactivar(R, 'otro', 'ana'),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('cambia el rol si queda otro gestor', async () => {
    const repo = repoFalso(1);

    await createPersonalService(repo).actualizar(R, 'otro', 'ana', edicion({ rolId: 'mozo' }));

    expect(repo.actualizar).toHaveBeenCalledWith(
      R,
      'ana',
      expect.objectContaining({ rolId: 'mozo' }),
      undefined,
    );
  });
});
