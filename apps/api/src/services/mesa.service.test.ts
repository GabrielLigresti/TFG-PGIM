import type { Mesa, MesaInput } from '@pgim/shared';
import type { MesaRepository } from '../repositories/mesa.repository';
import { createMesaService } from './mesa.service';

const R = 'restaurante';

const mesa: Mesa = { id: 'm1', numero: 1, capacidad: 4, posX: 10, posY: 15, activa: true };
const datos: MesaInput = { numero: 1, capacidad: 4, posX: 10, posY: 15 };

function repoFalso(cambios: Partial<MesaRepository> = {}): jest.Mocked<MesaRepository> {
  return {
    listar: jest.fn().mockResolvedValue([mesa]),
    existeSucursal: jest.fn().mockResolvedValue(true),
    buscar: jest.fn().mockResolvedValue(mesa),
    existeNumero: jest.fn().mockResolvedValue(false),
    crear: jest.fn().mockResolvedValue(mesa),
    actualizar: jest.fn().mockResolvedValue(mesa),
    desactivar: jest.fn(),
    ...cambios,
  } as jest.Mocked<MesaRepository>;
}

describe('mesaService', () => {
  it('una sucursal de otro restaurante responde 404', async () => {
    const repo = repoFalso({ existeSucursal: jest.fn().mockResolvedValue(false) });

    await expect(createMesaService(repo).crear(R, 'ajena', datos)).rejects.toMatchObject({
      status: 404,
    });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('rechaza un número de mesa repetido en la sucursal', async () => {
    const repo = repoFalso({ existeNumero: jest.fn().mockResolvedValue(true) });

    await expect(createMesaService(repo).crear(R, 'centro', datos)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('al editar, el número se compara con las demás mesas', async () => {
    const repo = repoFalso();

    await createMesaService(repo).actualizar(R, 'centro', 'm1', datos);

    expect(repo.existeNumero).toHaveBeenCalledWith('centro', 1, 'm1');
    expect(repo.actualizar).toHaveBeenCalledWith(R, 'centro', 'm1', datos);
  });

  it('editar una mesa que no existe responde 404', async () => {
    const repo = repoFalso({ buscar: jest.fn().mockResolvedValue(null) });

    await expect(
      createMesaService(repo).actualizar(R, 'centro', 'otra', datos),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('quien solo ve sucursales no ve el salón de una sucursal no asignada', async () => {
    const repo = repoFalso();

    await expect(
      createMesaService(repo).listar(R, ['sucursal.ver'], ['otra'], 'centro'),
    ).rejects.toMatchObject({ status: 404 });
    expect(repo.listar).not.toHaveBeenCalled();
  });

  it('quien administra sucursales ve el salón de cualquiera', async () => {
    const repo = repoFalso();

    await createMesaService(repo).listar(R, ['sucursal.ver', 'sucursal.editar'], [], 'centro');

    expect(repo.listar).toHaveBeenCalledWith(R, 'centro');
  });

  it('la baja es lógica', async () => {
    const repo = repoFalso();

    await createMesaService(repo).desactivar(R, 'centro', 'm1');

    expect(repo.desactivar).toHaveBeenCalledWith(R, 'centro', 'm1');
  });
});
