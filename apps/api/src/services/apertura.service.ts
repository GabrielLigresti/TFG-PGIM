import type { AsistenteApertura, ConfiguracionApertura } from '@pgim/shared';
import { pronosticarSemana } from '../domain/pronostico';
import { AppError } from '../lib/errors';
import {
  aperturaRepository,
  type AperturaRepository,
  type TenantSucursal,
} from '../repositories/apertura.repository';

// Asistente de apertura (CU-09): pronóstico de la semana siguiente de la sucursal de trabajo.
// `ahora` se inyecta para poder fijar el reloj en los tests.
export function createAperturaService(repo: AperturaRepository) {
  async function configuracionDe(t: TenantSucursal): Promise<ConfiguracionApertura> {
    const config = await repo.obtenerConfiguracion(t.restauranteId, t.sucursalId);
    if (!config) throw new AppError(404, 'La sucursal no tiene configuración de apertura');
    return config;
  }

  // Recalcula con datos frescos: corre dentro del lock del repositorio, así que
  // no reutiliza la lectura de afuera (pudo cambiar mientras se esperaba el lock).
  const calcularFresco = (t: TenantSucursal, ahora: Date) => async () => {
    const [config, historial] = await Promise.all([
      configuracionDe(t),
      repo.historial(t.restauranteId, t.sucursalId),
    ]);
    return pronosticarSemana(historial, config, ahora).filas;
  };

  return {
    // Si el historial no alcanza devuelve el progreso sin escribir; si alcanza,
    // genera la semana siguiente cuando falta y la devuelve.
    async obtenerAsistente(t: TenantSucursal, ahora: Date): Promise<AsistenteApertura> {
      const config = await configuracionDe(t);
      const historial = await repo.historial(t.restauranteId, t.sucursalId);
      const { semanaDesde, progreso } = pronosticarSemana(historial, config, ahora);
      if (!progreso.suficiente) return { semanaDesde, progreso, pronosticos: [] };

      await repo.generarSiFalta(t, semanaDesde, calcularFresco(t, ahora));
      const pronosticos = await repo.pronosticosDeSemana(
        t.restauranteId,
        t.sucursalId,
        semanaDesde,
      );
      return { semanaDesde, progreso, pronosticos };
    },

    // Con historial insuficiente no escribe y responde el progreso (200, sin
    // pronósticos), igual que el GET: la pantalla ya sabe mostrarlo.
    async regenerar(t: TenantSucursal, ahora: Date): Promise<AsistenteApertura> {
      const config = await configuracionDe(t);
      const historial = await repo.historial(t.restauranteId, t.sucursalId);
      const { semanaDesde, progreso } = pronosticarSemana(historial, config, ahora);
      if (!progreso.suficiente) return { semanaDesde, progreso, pronosticos: [] };

      await repo.reemplazarSemana(t, semanaDesde, calcularFresco(t, ahora));
      const pronosticos = await repo.pronosticosDeSemana(
        t.restauranteId,
        t.sucursalId,
        semanaDesde,
      );
      return { semanaDesde, progreso, pronosticos };
    },

    obtenerConfiguracion: (t: TenantSucursal) => configuracionDe(t),

    async actualizarConfiguracion(
      t: TenantSucursal,
      config: ConfiguracionApertura,
    ): Promise<ConfiguracionApertura> {
      const guardada = await repo.actualizarConfiguracion(t.restauranteId, t.sucursalId, config);
      if (!guardada) throw new AppError(404, 'La sucursal no tiene configuración de apertura');
      return guardada;
    },
  };
}

export const aperturaService = createAperturaService(aperturaRepository);
