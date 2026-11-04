import type { AsistenteApertura, ConfiguracionApertura, ProgresoDatos } from '@pgim/shared';
import type { Prisma } from '../generated/prisma/client';
import { pronosticarSemana } from '../domain/pronostico';
import { AppError } from '../lib/errors';
import {
  aperturaRepository,
  type CalcularFilas,
  type AperturaRepository,
  type TenantSucursal,
} from '../repositories/apertura.repository';

// Asistente de apertura (CU-09): pronóstico de la semana siguiente de la sucursal de trabajo.
// `ahora` se inyecta para poder fijar el reloj en los tests.
export function createAperturaService(repo: AperturaRepository) {
  async function configuracionDe(
    t: TenantSucursal,
    db?: Prisma.TransactionClient,
  ): Promise<ConfiguracionApertura> {
    const config = await repo.obtenerConfiguracion(t.restauranteId, t.sucursalId, db);
    if (!config) throw new AppError(404, 'La sucursal no tiene configuración de apertura');
    return config;
  }

  // Recalcula con datos frescos, dentro del lock del repositorio y con su
  // transacción: no reutiliza la lectura de afuera (pudo cambiar mientras se
  // esperaba el lock). Deja el progreso fresco en `ultimo` para armar la respuesta.
  function calcularFresco(t: TenantSucursal, ahora: Date) {
    const ultimo: { progreso?: ProgresoDatos } = {};
    const calcular: CalcularFilas = async (tx) => {
      const config = await configuracionDe(t, tx);
      const historial = await repo.historial(t.restauranteId, t.sucursalId, tx);
      const { filas, progreso } = pronosticarSemana(historial, config, ahora);
      ultimo.progreso = progreso;
      return { suficiente: progreso.suficiente, filas };
    };
    return { calcular, ultimo };
  }

  // Responde con el progreso recalculado dentro del lock, si se llegó a calcular.
  async function responder(
    t: TenantSucursal,
    semanaDesde: string,
    progresoAfuera: ProgresoDatos,
    fresco?: ProgresoDatos,
  ): Promise<AsistenteApertura> {
    const progreso = fresco ?? progresoAfuera;
    if (!progreso.suficiente) return { semanaDesde, progreso, pronosticos: [] };
    const pronosticos = await repo.pronosticosDeSemana(t.restauranteId, t.sucursalId, semanaDesde);
    return { semanaDesde, progreso, pronosticos };
  }

  return {
    // Si el historial no alcanza devuelve el progreso sin escribir; si alcanza,
    // genera la semana siguiente cuando falta y la devuelve.
    async obtenerAsistente(t: TenantSucursal, ahora: Date): Promise<AsistenteApertura> {
      const config = await configuracionDe(t);
      const historial = await repo.historial(t.restauranteId, t.sucursalId);
      const { semanaDesde, progreso } = pronosticarSemana(historial, config, ahora);
      if (!progreso.suficiente) return { semanaDesde, progreso, pronosticos: [] };

      const { calcular, ultimo } = calcularFresco(t, ahora);
      await repo.generarSiFalta(t, semanaDesde, calcular);
      return responder(t, semanaDesde, progreso, ultimo.progreso);
    },

    // Con historial insuficiente no escribe y responde el progreso (200, sin
    // pronósticos), igual que el GET: la pantalla ya sabe mostrarlo.
    async regenerar(t: TenantSucursal, ahora: Date): Promise<AsistenteApertura> {
      const config = await configuracionDe(t);
      const historial = await repo.historial(t.restauranteId, t.sucursalId);
      const { semanaDesde, progreso } = pronosticarSemana(historial, config, ahora);
      if (!progreso.suficiente) return { semanaDesde, progreso, pronosticos: [] };

      const { calcular, ultimo } = calcularFresco(t, ahora);
      await repo.reemplazarSemana(t, semanaDesde, calcular);
      return responder(t, semanaDesde, progreso, ultimo.progreso);
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
