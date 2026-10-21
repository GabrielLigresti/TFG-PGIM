import type { Sucursal, SucursalInput } from '@pgim/shared';
import type { SucursalRepository } from '../repositories/sucursal.repository';
import { createSucursalService } from './sucursal.service';

const R = 'restaurante';

const centro: Sucursal = {
  id: 'centro',
  nombre: 'Centro',
  direccion: 'Calle 1',
  horarioApertura: '12:00',
  horarioCierre: '00:00',
  toleranciaNoShowMin: 15,
  activa: true,
  horariosServicio: [],
};

const datos: SucursalInput = { ...centro, horariosServicio: [] };

function repoFalso(cambios: Partial<SucursalRepository> = {}): jest.Mocked<SucursalRepository> {
  return {
    listar: jest.fn(),
    buscar: jest.fn().mockResolvedValue(centro),
    existeNombre: jest.fn().mockResolvedValue(false),
    contarActivas: jest.fn().mockResolvedValue(2),
    crear: jest.fn().mockResolvedValue(centro),
    actualizar: jest.fn().mockResolvedValue(centro),
    desactivar: jest.fn(),
    ...cambios,
  } as jest.Mocked<SucursalRepository>;
}

describe('sucursalService', () => {
  it('quien administra sucursales ve todas', async () => {
    const repo = repoFalso();

    await createSucursalService(repo).listar(R, ['sucursal.ver', 'sucursal.editar'], ['centro']);

    expect(repo.listar).toHaveBeenCalledWith(R);
  });

  it('quien solo ve sucursales ve las que tiene asignadas', async () => {
    const repo = repoFalso();

    await createSucursalService(repo).listar(R, ['sucursal.ver'], ['centro']);

    expect(repo.listar).toHaveBeenCalledWith(R, ['centro']);
  });

  it('crea la sucursal asignándola a quien la da de alta', async () => {
    const repo = repoFalso();

    await createSucursalService(repo).crear(R, 'empleado', datos);

    expect(repo.crear).toHaveBeenCalledWith(R, datos, 'empleado');
  });

  it('rechaza un nombre repetido', async () => {
    const repo = repoFalso({ existeNombre: jest.fn().mockResolvedValue(true) });

    await expect(createSucursalService(repo).crear(R, 'empleado', datos)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('no deja dar de baja la única sucursal activa', async () => {
    const repo = repoFalso({ contarActivas: jest.fn().mockResolvedValue(1) });

    await expect(createSucursalService(repo).desactivar(R, 'centro')).rejects.toMatchObject({
      status: 409,
    });
    expect(repo.desactivar).not.toHaveBeenCalled();
  });

  it('tampoco por edición con activa en false', async () => {
    const repo = repoFalso({ contarActivas: jest.fn().mockResolvedValue(1) });

    await expect(
      createSucursalService(repo).actualizar(R, 'centro', { ...datos, activa: false }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('da de baja si quedan otras activas', async () => {
    const repo = repoFalso();

    await createSucursalService(repo).desactivar(R, 'centro');

    expect(repo.desactivar).toHaveBeenCalledWith(R, 'centro');
  });

  it('responde 404 con una sucursal de otro restaurante', async () => {
    const repo = repoFalso({ buscar: jest.fn().mockResolvedValue(null) });

    await expect(createSucursalService(repo).desactivar(R, 'ajena')).rejects.toMatchObject({
      status: 404,
    });
  });
});
