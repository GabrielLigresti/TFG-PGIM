import type { ConfiguracionApertura } from '@pgim/shared';
import type { HistorialVentas } from '../domain/pronostico';
import type { AperturaRepository } from '../repositories/apertura.repository';
import { createAperturaService } from './apertura.service';

const T = { restauranteId: 'r1', sucursalId: 's1' };
// Miércoles: la semana siguiente arranca el lunes 2026-11-09.
const AHORA = new Date('2026-11-04T15:00:00Z');
const SEMANA = '2026-11-09';
const CONFIG: ConfiguracionApertura = {
  semanasHistoricoMinimo: 8,
  cubiertosPorMozo: 20,
  platosPorCocineroHora: 12,
};

const horarios = [{ franja: 'ALMUERZO' as const, horaInicio: '12:00', horaFin: '16:00' }];
const historialCon = (primera: string): HistorialVentas => ({
  reservas: [{ inicio: new Date(primera), cantidadPersonas: 4, lineas: [] }],
  horarios,
  items: [],
});
// ~9 semanas de datos, y 2 semanas de datos.
const SUFICIENTE = historialCon('2026-09-01T16:00:00Z');
const INSUFICIENTE = historialCon('2026-10-20T16:00:00Z');

function repoFalso(historial: HistorialVentas, config: ConfiguracionApertura | null = CONFIG) {
  return {
    obtenerConfiguracion: jest.fn().mockResolvedValue(config),
    actualizarConfiguracion: jest.fn(),
    historial: jest.fn().mockResolvedValue(historial),
    pronosticosDeSemana: jest.fn().mockResolvedValue([]),
    generarSiFalta: jest.fn().mockResolvedValue(true),
    reemplazarSemana: jest.fn().mockResolvedValue(undefined),
  } satisfies Record<keyof AperturaRepository, jest.Mock>;
}
const servicio = (repo: ReturnType<typeof repoFalso>) =>
  createAperturaService(repo as unknown as AperturaRepository);

describe('aperturaService', () => {
  it('sin configuración responde 404', async () => {
    const repo = repoFalso(SUFICIENTE, null);
    await expect(servicio(repo).obtenerAsistente(T, AHORA)).rejects.toMatchObject({ status: 404 });
    await expect(servicio(repo).regenerar(T, AHORA)).rejects.toMatchObject({ status: 404 });
    await expect(servicio(repo).obtenerConfiguracion(T)).rejects.toMatchObject({ status: 404 });
  });

  it('con historial insuficiente devuelve el progreso y no escribe', async () => {
    const repo = repoFalso(INSUFICIENTE);
    const res = await servicio(repo).obtenerAsistente(T, AHORA);
    expect(res).toMatchObject({
      semanaDesde: SEMANA,
      progreso: { semanas: 2, minimo: 8, suficiente: false },
      pronosticos: [],
    });
    expect(repo.generarSiFalta).not.toHaveBeenCalled();
    expect(repo.pronosticosDeSemana).not.toHaveBeenCalled();
  });

  it('con historial suficiente genera si falta y devuelve los pronósticos guardados', async () => {
    const repo = repoFalso(SUFICIENTE);
    repo.pronosticosDeSemana.mockResolvedValue([{ fecha: SEMANA }]);
    const res = await servicio(repo).obtenerAsistente(T, AHORA);
    expect(repo.generarSiFalta).toHaveBeenCalledWith(T, SEMANA, expect.any(Function));
    expect(repo.pronosticosDeSemana).toHaveBeenCalledWith('r1', 's1', SEMANA);
    expect(res.progreso.suficiente).toBe(true);
    expect(res.pronosticos).toEqual([{ fecha: SEMANA }]);
  });

  it('calcular relee configuración e historial dentro del lock', async () => {
    const repo = repoFalso(SUFICIENTE);
    await servicio(repo).obtenerAsistente(T, AHORA);
    expect(repo.historial).toHaveBeenCalledTimes(1);
    const calcular = repo.generarSiFalta.mock.calls[0]![2] as () => Promise<unknown[]>;
    const filas = await calcular();
    expect(repo.historial).toHaveBeenCalledTimes(2);
    expect(repo.obtenerConfiguracion).toHaveBeenCalledTimes(2);
    expect(filas).toHaveLength(7); // una franja, siete días
  });

  it('regenerar con historial suficiente reemplaza la semana', async () => {
    const repo = repoFalso(SUFICIENTE);
    const res = await servicio(repo).regenerar(T, AHORA);
    expect(repo.reemplazarSemana).toHaveBeenCalledWith(T, SEMANA, expect.any(Function));
    expect(res.semanaDesde).toBe(SEMANA);
  });

  it('regenerar con historial insuficiente devuelve el progreso y no escribe', async () => {
    const repo = repoFalso(INSUFICIENTE);
    const res = await servicio(repo).regenerar(T, AHORA);
    expect(res.pronosticos).toEqual([]);
    expect(res.progreso.suficiente).toBe(false);
    expect(repo.reemplazarSemana).not.toHaveBeenCalled();
  });

  it('actualizarConfiguracion responde 404 si la sucursal no tiene configuración', async () => {
    const repo = repoFalso(SUFICIENTE);
    repo.actualizarConfiguracion.mockResolvedValue(null);
    await expect(servicio(repo).actualizarConfiguracion(T, CONFIG)).rejects.toMatchObject({
      status: 404,
    });
    repo.actualizarConfiguracion.mockResolvedValue(CONFIG);
    await expect(servicio(repo).actualizarConfiguracion(T, CONFIG)).resolves.toEqual(CONFIG);
  });
});
