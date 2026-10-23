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
    reservasVigentes: jest.fn().mockResolvedValue([]),
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

    expect(repo.existeNumero).toHaveBeenCalledWith(R, 'centro', 1, 'm1');
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

  it('crea la mesa acotada al restaurante', async () => {
    const repo = repoFalso();

    await createMesaService(repo).crear(R, 'centro', datos);

    expect(repo.existeNumero).toHaveBeenCalledWith(R, 'centro', 1, undefined);
    expect(repo.crear).toHaveBeenCalledWith(R, 'centro', datos);
  });

  describe('con reservas vigentes', () => {
    // 17:00 del 30/10 en Argentina.
    const AHORA = new Date('2026-10-30T20:00:00.000Z');
    const reserva = (estado: 'PENDIENTE' | 'ACTIVA', inicio: string, cantidadPersonas = 3) => ({
      estado,
      inicio: new Date(inicio),
      cantidadPersonas,
      toleranciaNoShowMin: 15,
    });
    // Una para 3 personas a las 20:00 de hoy.
    const conReservas = (filas = [reserva('PENDIENTE', '2026-10-30T23:00:00.000Z')]) =>
      repoFalso({ reservasVigentes: jest.fn().mockResolvedValue(filas) });
    const servicio = (repo: MesaRepository) => createMesaService(repo, () => AHORA);

    it('no se da de baja', async () => {
      const repo = conReservas();

      await expect(servicio(repo).desactivar(R, 'centro', 'm1')).rejects.toMatchObject({
        status: 409,
      });
      expect(repo.desactivar).not.toHaveBeenCalled();
    });

    it('tampoco por edición con activa en false', async () => {
      const repo = conReservas();

      await expect(
        servicio(repo).actualizar(R, 'centro', 'm1', { ...datos, activa: false }),
      ).rejects.toMatchObject({ status: 409 });
      expect(repo.actualizar).not.toHaveBeenCalled();
    });

    it('no se achica por debajo del grupo más grande que la tiene reservada', async () => {
      const repo = conReservas();

      await expect(
        servicio(repo).actualizar(R, 'centro', 'm1', { ...datos, capacidad: 2 }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('se puede mover o achicar hasta ese grupo', async () => {
      const repo = conReservas();

      await servicio(repo).actualizar(R, 'centro', 'm1', { ...datos, capacidad: 3, posX: 40 });

      expect(repo.actualizar).toHaveBeenCalled();
    });

    it('una activa de una franja que ya terminó no la traba', async () => {
      const repo = conReservas([reserva('ACTIVA', '2026-10-29T23:00:00.000Z', 8)]);

      await servicio(repo).desactivar(R, 'centro', 'm1');

      expect(repo.desactivar).toHaveBeenCalled();
    });

    it('una pendiente pasada la tolerancia (a punto de vencer) no la traba', async () => {
      const repo = conReservas([reserva('PENDIENTE', '2026-10-30T19:00:00.000Z', 8)]);

      await servicio(repo).actualizar(R, 'centro', 'm1', { ...datos, capacidad: 2 });

      expect(repo.actualizar).toHaveBeenCalled();
    });

    it('una mesa que ya estaba dada de baja se puede mover', async () => {
      const repo = conReservas();
      repo.buscar.mockResolvedValue({ ...mesa, activa: false });

      await servicio(repo).actualizar(R, 'centro', 'm1', { ...datos, activa: false, posX: 40 });

      expect(repo.actualizar).toHaveBeenCalled();
    });
  });
});
