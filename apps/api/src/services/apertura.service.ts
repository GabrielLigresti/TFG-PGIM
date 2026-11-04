import type {
  AsistenteApertura,
  ConfiguracionApertura,
  PlanificacionSemana,
  ProgresoDatos,
} from '@pgim/shared';
import { busEventos, type BusEventos } from '../domain/eventos';
import { horasDeFranja } from '../domain/capacidad';
import { pronosticarSemana, servicioDeReserva } from '../domain/pronostico';
import { asignacionGolosaBalanceada, calcularDotacion, faltantes } from '../domain/turnos';
import {
  crearVerificadorMesas,
  crearVerificadorStock,
  type Verificador,
} from '../domain/verificadores';
import type { Franja } from '@pgim/shared';
import type { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import {
  aperturaRepository,
  type AperturaRepository,
  type TenantSucursal,
} from '../repositories/apertura.repository';
import {
  planificacionRepository,
  type FasesPlanificacion,
  type PlanificacionRepository,
} from '../repositories/planificacion.repository';

// Asistente de apertura (CU-09), fachada AsistenteApertura: pronostica la semana
// siguiente de la sucursal de trabajo, corre los verificadores, calcula la
// dotación, asigna los turnos y deja la planificación en borrador hasta que el
// gerente la confirma. `ahora` se inyecta para poder fijar el reloj en los tests.
export function createAperturaService(
  repo: AperturaRepository,
  plan: PlanificacionRepository,
  bus: BusEventos = busEventos,
) {
  async function configuracionDe(
    t: TenantSucursal,
    db?: Prisma.TransactionClient,
  ): Promise<ConfiguracionApertura> {
    const config = await repo.obtenerConfiguracion(t.restauranteId, t.sucursalId, db);
    if (!config) throw new AppError(404, 'La sucursal no tiene configuración de apertura');
    return config;
  }

  // Las dos fases corren dentro del lock del repositorio y con su transacción:
  // no reutilizan la lectura de afuera (pudo cambiar mientras se esperaba el
  // lock). Deja el progreso fresco en `ultimo` para armar la respuesta.
  function fasesDe(t: TenantSucursal, semanaDesde: string, ahora: Date) {
    const ultimo: { progreso?: ProgresoDatos } = {};
    const fases: FasesPlanificacion = {
      async pronosticar(tx) {
        const config = await configuracionDe(t, tx);
        const historial = await repo.historial(t.restauranteId, t.sucursalId, tx);
        const { filas, progreso } = pronosticarSemana(historial, config, ahora);
        ultimo.progreso = progreso;
        return { suficiente: progreso.suficiente, filas };
      },

      async planificar(tx, pronosticos) {
        const config = await configuracionDe(t, tx);
        const ctx = await plan.contexto(t, semanaDesde, tx);
        const horasPorFranja = new Map<Franja, number>(
          ctx.horarios.map((h) => [h.franja, horasDeFranja(h)]),
        );

        const reservados = new Map<string, number>();
        for (const r of ctx.reservas) {
          const servicio = servicioDeReserva(r.inicio, ctx.horarios);
          if (!servicio) continue;
          const clave = `${servicio.fecha}|${servicio.franja}`;
          reservados.set(clave, (reservados.get(clave) ?? 0) + r.cantidadPersonas);
        }

        const verificadores: Verificador[] = [
          crearVerificadorStock({
            semanaDesde,
            recetas: ctx.recetas,
            existencias: ctx.existencias,
          }),
          crearVerificadorMesas({
            capacidadMesas: ctx.capacidadMesas,
            horasPorFranja,
            reservados,
          }),
        ];
        const alertas = verificadores.flatMap((v) => v.verificar(pronosticos));

        const dotacion = calcularDotacion(pronosticos, config, horasPorFranja, ctx.conReceta);
        const turnos = asignacionGolosaBalanceada.asignar(dotacion, ctx.empleados, horasPorFranja);
        alertas.push(...faltantes(dotacion, turnos, ctx.empleados));
        return { alertas, turnos };
      },
    };
    return { fases, ultimo };
  }

  // Responde con el progreso recalculado dentro del lock, si se llegó a calcular.
  async function responder(
    t: TenantSucursal,
    semanaDesde: string,
    progresoAfuera: ProgresoDatos,
    fresco?: ProgresoDatos,
    existente?: PlanificacionSemana | null,
  ): Promise<AsistenteApertura> {
    const progreso = fresco ?? progresoAfuera;
    if (!progreso.suficiente)
      return { semanaDesde, progreso, pronosticos: [], planificacion: null };
    const pronosticos = await repo.pronosticosDeSemana(t.restauranteId, t.sucursalId, semanaDesde);
    const planificacion = existente ?? (await plan.deSemana(t, semanaDesde));
    return { semanaDesde, progreso, pronosticos, planificacion };
  }

  return {
    // Si el historial no alcanza devuelve el progreso sin escribir (E1). Si la
    // semana ya tiene planificación la devuelve sin recalcular; si no, la crea.
    async obtenerAsistente(t: TenantSucursal, ahora: Date): Promise<AsistenteApertura> {
      const config = await configuracionDe(t);
      const historial = await repo.historial(t.restauranteId, t.sucursalId);
      const { semanaDesde, progreso } = pronosticarSemana(historial, config, ahora);
      if (!progreso.suficiente) {
        return { semanaDesde, progreso, pronosticos: [], planificacion: null };
      }

      const existente = await plan.deSemana(t, semanaDesde);
      if (existente) return responder(t, semanaDesde, progreso, undefined, existente);

      const { fases, ultimo } = fasesDe(t, semanaDesde, ahora);
      await plan.planificar(t, semanaDesde, fases);
      return responder(t, semanaDesde, progreso, ultimo.progreso);
    },

    // Con historial insuficiente no escribe y responde el progreso (200, sin
    // pronósticos), igual que el GET: la pantalla ya sabe mostrarlo. Una semana
    // confirmada se rechaza con 409 dentro del lock.
    async regenerar(t: TenantSucursal, ahora: Date): Promise<AsistenteApertura> {
      const config = await configuracionDe(t);
      const historial = await repo.historial(t.restauranteId, t.sucursalId);
      const { semanaDesde, progreso } = pronosticarSemana(historial, config, ahora);
      if (!progreso.suficiente) {
        return { semanaDesde, progreso, pronosticos: [], planificacion: null };
      }

      const { fases, ultimo } = fasesDe(t, semanaDesde, ahora);
      await plan.reemplazarYPlanificar(t, semanaDesde, fases);
      return responder(t, semanaDesde, progreso, ultimo.progreso);
    },

    // El aviso a la sucursal sale después del commit: si el repositorio falla, no se publica.
    async confirmar(t: TenantSucursal, id: string, ahora: Date): Promise<PlanificacionSemana> {
      const confirmada = await plan.confirmar(t, id, ahora);
      bus.publicar({
        tipo: 'PLANIFICACION_CONFIRMADA',
        sucursalId: t.sucursalId,
        planificacionId: id,
      });
      return confirmada;
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

export const aperturaService = createAperturaService(aperturaRepository, planificacionRepository);
