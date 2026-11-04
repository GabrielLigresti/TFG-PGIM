import { randomUUID } from 'node:crypto';
import {
  ETIQUETA_UNIDAD,
  type AlertaSimulador,
  type Arquetipo,
  type DotacionFranja,
  type EstadoPlanificacion,
  type Franja,
  type MiTurno,
  type PlanificacionSemana,
  type TurnoPlanificado,
  type UnidadMedida,
} from '@pgim/shared';
import { horasDeFranja } from '../domain/capacidad';
import { sumarDias } from '../domain/franjas';
import { estadoDePlanificacion } from '../domain/planificacion';
import type { FilaPronostico, HorarioServicioDatos } from '../domain/pronostico';
import type { Receta } from '../domain/receta';
import type { ArquetipoTurno, EmpleadoAsignable, TurnoAsignado } from '../domain/turnos';
import type { AlertaNueva, ContextoStock, PronosticoAVerificar } from '../domain/verificadores';
import type { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import { aHora } from '../lib/hora';
import { prisma } from '../lib/prisma';
import { aFecha, deFecha, rangoSemana, type TenantSucursal } from './apertura.repository';
import { bloquearSucursal } from './bloqueo-stock';
import { armarReceta, aRecetaFila, recetaRepository, seleccionReceta } from './receta.repository';

export interface ResultadoPlanificacion {
  alertas: AlertaNueva[];
  turnos: TurnoAsignado[];
}

// La planificación corre en dos fases, las dos con la transacción del lock
// (una sola conexión del pool): `pronosticar` genera las filas nuevas y
// `planificar` verifica y asigna sobre los pronósticos ya guardados, que son los
// que referencian las alertas. Si el historial ya no alcanza (pudo cambiar
// mientras se esperaba el lock), `pronosticar` devuelve `suficiente: false` y
// el repositorio no escribe nada.
export interface FasesPlanificacion {
  pronosticar(
    tx: Prisma.TransactionClient,
  ): Promise<{ suficiente: boolean; filas: FilaPronostico[] }>;
  planificar(
    tx: Prisma.TransactionClient,
    pronosticos: PronosticoAVerificar[],
  ): Promise<ResultadoPlanificacion>;
}

// Todo lo que leen los verificadores y la asignación, en pocas consultas.
export interface ContextoPlanificacion {
  horarios: HorarioServicioDatos[];
  recetas: Map<string, Receta>; // por itemMenuId, solo platos activos con receta
  existencias: ContextoStock['existencias'];
  conReceta: Set<string>; // ítems cuya categoría exige receta (cuentan para los cocineros)
  capacidadMesas: number[]; // mesas activas
  reservas: { inicio: Date; cantidadPersonas: number }[]; // PENDIENTE y ACTIVA, con margen de un día
  empleados: EmpleadoAsignable[];
}

export interface PlanificacionRepository {
  // Si la semana no tiene planificación (comprobado dentro del lock) guarda los
  // pronósticos que falten, verifica, asigna y crea la planificación en
  // BORRADOR. Devuelve false si ya había planificación o el historial no alcanzaba.
  planificar(
    tenant: TenantSucursal,
    semanaDesde: string,
    fases: FasesPlanificacion,
  ): Promise<boolean>;
  // Rechaza con 409 si está confirmada. Si no, borra alertas con pronóstico,
  // planificación y pronósticos de la semana, y vuelve a planificar. Devuelve
  // false, sin tocar nada, si el historial no alcanzaba.
  reemplazarYPlanificar(
    tenant: TenantSucursal,
    semanaDesde: string,
    fases: FasesPlanificacion,
  ): Promise<boolean>;
  // 404 si no existe en la sucursal, 409 si ya estaba confirmada.
  confirmar(tenant: TenantSucursal, id: string, ahora: Date): Promise<PlanificacionSemana>;
  // Solo el commit de la confirmación: devuelve la semana confirmada, sin releerla.
  // Permite avisar apenas se confirma, aunque después falle la lectura.
  confirmarSemana(tenant: TenantSucursal, id: string, ahora: Date): Promise<string>;
  deSemana(tenant: TenantSucursal, semanaDesde: string): Promise<PlanificacionSemana | null>;
  contexto(
    tenant: TenantSucursal,
    semanaDesde: string,
    db: Prisma.TransactionClient,
  ): Promise<ContextoPlanificacion>;
  // Turnos del empleado de hoy en adelante (`desde`, AAAA-MM-DD), solo de
  // planificaciones confirmadas, con el horario de su franja.
  turnosDe(restauranteId: string, empleadoId: string, desde: string): Promise<MiTurno[]>;
}

const TIMEOUT_TX_MS = 15_000;
const ARQUETIPOS_TURNO: ArquetipoTurno[] = ['MOZO', 'COCINERO'];

async function asegurarSucursal(tx: Prisma.TransactionClient, t: TenantSucursal) {
  const sucursal = await tx.sucursal.findFirst({
    where: { id: t.sucursalId, restauranteId: t.restauranteId },
    select: { id: true },
  });
  if (!sucursal) throw new Error('Sucursal fuera del restaurante');
}

async function guardarPronosticos(
  tx: Prisma.TransactionClient,
  sucursalId: string,
  filas: FilaPronostico[],
) {
  const ids = filas.map(() => randomUUID());
  await tx.pronostico.createMany({
    data: filas.map((f, i) => ({
      id: ids[i]!,
      sucursalId,
      fechaServicio: aFecha(f.fecha),
      franja: f.franja,
      cubiertosEstimados: f.cubiertosEstimados,
      limiteInferior: f.limiteInferior,
      limiteSuperior: f.limiteSuperior,
      ingresoEstimado: f.ingresoEstimado.toFixed(2),
      errorMape: f.errorMape.toFixed(2),
      metodo: f.metodo,
    })),
  });
  await tx.demandaItem.createMany({
    data: filas.flatMap((f, i) =>
      f.demanda.map((d) => ({
        pronosticoId: ids[i]!,
        itemMenuId: d.itemMenuId,
        cantidadEstimada: d.cantidad,
      })),
    ),
  });
}

const ORDEN_FRANJA: Record<Franja, number> = { ALMUERZO: 0, CENA: 1 };

async function leerPronosticos(
  tx: Prisma.TransactionClient,
  { sucursalId }: TenantSucursal,
  semanaDesde: string,
): Promise<PronosticoAVerificar[]> {
  const filas = await tx.pronostico.findMany({
    where: { sucursalId, fechaServicio: rangoSemana(semanaDesde) },
    select: {
      id: true,
      fechaServicio: true,
      franja: true,
      cubiertosEstimados: true,
      demandasItem: { select: { itemMenuId: true, cantidadEstimada: true } },
    },
  });
  return filas
    .map((p) => ({
      id: p.id,
      fecha: deFecha(p.fechaServicio),
      franja: p.franja as Franja,
      cubiertosEstimados: p.cubiertosEstimados,
      demanda: p.demandasItem
        .map((d) => ({ itemMenuId: d.itemMenuId, cantidad: d.cantidadEstimada }))
        .sort((a, b) => (a.itemMenuId < b.itemMenuId ? -1 : 1)),
    }))
    .sort(
      (a, b) =>
        (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0) ||
        ORDEN_FRANJA[a.franja] - ORDEN_FRANJA[b.franja],
    );
}

type Modo = 'planificar' | 'reemplazar';

function ejecutar(
  tenant: TenantSucursal,
  semanaDesde: string,
  fases: FasesPlanificacion,
  modo: Modo,
): Promise<boolean> {
  const { sucursalId } = tenant;
  return prisma.$transaction(
    async (tx) => {
      await bloquearSucursal(tx, 'apertura', sucursalId);
      await asegurarSucursal(tx, tenant);

      // El estado se lee con el lock tomado: otra transacción pudo cambiarlo mientras se esperaba.
      const existente = await tx.planificacionTurnos.findFirst({
        where: { sucursalId, semanaDesde: aFecha(semanaDesde) },
        select: { id: true, estado: true },
      });
      if (modo === 'planificar' && existente) return false;
      if (modo === 'reemplazar' && existente) {
        estadoDePlanificacion(existente.estado).regenerar();
      }

      if (
        modo === 'planificar' &&
        (await tx.pronostico.count({
          where: { sucursalId, fechaServicio: rangoSemana(semanaDesde) },
        })) > 0
      ) {
        // Pronósticos del 6B sin planificación: se conservan.
      } else {
        const { suficiente, filas } = await fases.pronosticar(tx);
        if (!suficiente) return false;
        if (modo === 'reemplazar') {
          // alerta.pronostico_id no tiene cascada: primero las alertas, después la
          // planificación (cascada de turnos y alertas) y al final los pronósticos.
          await tx.alerta.deleteMany({
            where: {
              sucursalId,
              pronostico: { sucursalId, fechaServicio: rangoSemana(semanaDesde) },
            },
          });
          await tx.planificacionTurnos.deleteMany({
            where: { sucursalId, semanaDesde: aFecha(semanaDesde) },
          });
          await tx.pronostico.deleteMany({
            where: { sucursalId, fechaServicio: rangoSemana(semanaDesde) },
          });
        }
        await guardarPronosticos(tx, sucursalId, filas);
      }

      const pronosticos = await leerPronosticos(tx, tenant, semanaDesde);
      const { alertas, turnos } = await fases.planificar(tx, pronosticos);

      const planificacion = await tx.planificacionTurnos.create({
        data: { sucursalId, semanaDesde: aFecha(semanaDesde) },
        select: { id: true },
      });
      await tx.turno.createMany({
        data: turnos.map((t) => ({
          planificacionId: planificacion.id,
          empleadoId: t.empleadoId,
          sucursalId,
          fecha: aFecha(t.fecha),
          franja: t.franja,
        })),
      });
      await tx.alerta.createMany({
        data: alertas.map((a) => ({
          sucursalId,
          planificacionId: planificacion.id,
          pronosticoId: a.pronosticoId,
          existenciaId: a.existenciaId,
          tipo: a.tipo,
          severidad: a.severidad,
          descripcion: a.descripcion,
          fechaServicio: aFecha(a.fecha),
          franja: a.franja,
          arquetipo: a.arquetipo,
          cantidad: a.cantidad,
        })),
      });
      return true;
    },
    { timeout: TIMEOUT_TX_MS },
  );
}

export const planificacionRepository: PlanificacionRepository = {
  planificar: (tenant, semanaDesde, fases) => ejecutar(tenant, semanaDesde, fases, 'planificar'),

  reemplazarYPlanificar: (tenant, semanaDesde, fases) =>
    ejecutar(tenant, semanaDesde, fases, 'reemplazar'),

  async confirmar(tenant, id, ahora) {
    const semanaDesde = await planificacionRepository.confirmarSemana(tenant, id, ahora);
    return (await planificacionRepository.deSemana(tenant, semanaDesde))!;
  },

  async confirmarSemana(tenant, id, ahora) {
    return prisma.$transaction(
      async (tx) => {
        await bloquearSucursal(tx, 'apertura', tenant.sucursalId);
        const plan = await tx.planificacionTurnos.findFirst({
          where: {
            id,
            sucursalId: tenant.sucursalId,
            sucursal: { restauranteId: tenant.restauranteId },
          },
          select: { estado: true, semanaDesde: true },
        });
        if (!plan) throw new AppError(404, 'La planificación no existe');
        const nuevo = estadoDePlanificacion(plan.estado).confirmar();
        const { count } = await tx.planificacionTurnos.updateMany({
          where: { id, sucursalId: tenant.sucursalId, estado: plan.estado },
          data: { estado: nuevo, confirmadaEn: ahora },
        });
        if (count === 0) throw new AppError(409, 'La planificación ya está confirmada');
        return deFecha(plan.semanaDesde);
      },
      { timeout: TIMEOUT_TX_MS },
    );
  },

  async deSemana({ restauranteId, sucursalId }, semanaDesde) {
    const p = await prisma.planificacionTurnos.findFirst({
      where: { sucursalId, sucursal: { restauranteId }, semanaDesde: aFecha(semanaDesde) },
      include: {
        turnos: {
          orderBy: [{ fecha: 'asc' }, { franja: 'asc' }, { empleadoId: 'asc' }],
          include: {
            empleado: { select: { nombreCompleto: true, rol: { select: { arquetipo: true } } } },
          },
        },
        alertas: {
          where: { sucursalId },
          orderBy: [{ fechaServicio: 'asc' }, { franja: 'asc' }, { tipo: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!p) return null;

    const turnos: TurnoPlanificado[] = p.turnos.map((t) => ({
      fecha: deFecha(t.fecha),
      franja: t.franja as Franja,
      empleadoId: t.empleadoId,
      nombre: t.empleado.nombreCompleto,
      arquetipo: t.empleado.rol.arquetipo as Arquetipo,
    }));
    const alertas: AlertaSimulador[] = p.alertas.map((a) => ({
      id: a.id,
      tipo: a.tipo as AlertaSimulador['tipo'],
      severidad: a.severidad,
      descripcion: a.descripcion,
      fecha: a.fechaServicio ? deFecha(a.fechaServicio) : null,
      franja: a.franja as Franja | null,
      arquetipo: a.arquetipo as Arquetipo | null,
      cantidad: a.cantidad,
    }));

    // La dotación no se guarda: es lo asignado más lo que faltó, así una
    // semana confirmada no cambia si después se toca la configuración.
    const dotacion = new Map<string, DotacionFranja>();
    const sumar = (
      fecha: string,
      franja: Franja,
      arquetipo: Arquetipo | null,
      cantidad: number,
    ) => {
      if (arquetipo !== 'MOZO' && arquetipo !== 'COCINERO') return;
      const clave = `${fecha}|${franja}|${arquetipo}`;
      const fila = dotacion.get(clave) ?? { fecha, franja, arquetipo, cantidad: 0 };
      fila.cantidad += cantidad;
      dotacion.set(clave, fila);
    };
    for (const t of turnos) sumar(t.fecha, t.franja, t.arquetipo, 1);
    for (const a of alertas) {
      if (a.tipo === 'FALTANTE_PERSONAL' && a.fecha && a.franja) {
        sumar(a.fecha, a.franja, a.arquetipo, a.cantidad ?? 0);
      }
    }
    const orden = (d: DotacionFranja) =>
      `${d.fecha}|${ORDEN_FRANJA[d.franja]}|${d.arquetipo === 'MOZO' ? 0 : 1}`;

    return {
      id: p.id,
      estado: p.estado as EstadoPlanificacion,
      semanaDesde: deFecha(p.semanaDesde),
      generadaEn: p.generadaEn.toISOString(),
      confirmadaEn: p.confirmadaEn?.toISOString() ?? null,
      turnos,
      alertas,
      dotacion: [...dotacion.values()].sort((a, b) => (orden(a) < orden(b) ? -1 : 1)),
    };
  },

  async turnosDe(restauranteId, empleadoId, desde) {
    const turnos = await prisma.turno.findMany({
      where: {
        empleadoId,
        fecha: { gte: aFecha(desde) },
        sucursal: { restauranteId },
        planificacion: { estado: 'CONFIRMADA', sucursal: { restauranteId } },
        empleado: { restauranteId },
      },
      orderBy: [{ fecha: 'asc' }, { franja: 'asc' }],
      select: {
        fecha: true,
        franja: true,
        sucursalId: true,
        sucursal: { select: { nombre: true } },
      },
    });
    const horarios = await prisma.horarioServicio.findMany({
      where: {
        sucursalId: { in: [...new Set(turnos.map((t) => t.sucursalId))] },
        sucursal: { restauranteId },
      },
    });
    const horario = new Map(horarios.map((h) => [`${h.sucursalId}|${h.franja}`, h]));
    return turnos.map((t) => {
      const h = horario.get(`${t.sucursalId}|${t.franja}`);
      return {
        fecha: deFecha(t.fecha),
        franja: t.franja as Franja,
        sucursal: t.sucursal.nombre,
        horaInicio: h ? aHora(h.horaInicio) : '',
        horaFin: h ? aHora(h.horaFin) : '',
      };
    });
  },

  async contexto({ restauranteId, sucursalId }, semanaDesde, db) {
    // En serie y con la transacción del llamador: una sola conexión.
    const horariosFilas = await db.horarioServicio.findMany({
      where: { sucursalId, sucursal: { restauranteId } },
      orderBy: { horaInicio: 'asc' },
    });
    const horarios = horariosFilas.map<HorarioServicioDatos>((h) => ({
      franja: h.franja as Franja,
      horaInicio: aHora(h.horaInicio),
      horaFin: aHora(h.horaFin),
    }));

    const catalogo = await recetaRepository.cargarCatalogo(restauranteId, db);
    const platos = await db.itemMenu.findMany({
      where: { restauranteId, activo: true, receta: { isNot: null } },
      select: { id: true, receta: { select: seleccionReceta } },
    });
    const recetas = new Map<string, Receta>();
    for (const p of platos) {
      if (p.receta) recetas.set(p.id, armarReceta(aRecetaFila(p.receta), catalogo));
    }
    // Reventa: sin receta, consume 1 unidad del insumo por porción (como el menú del comensal).
    const reventa = await db.itemMenu.findMany({
      where: { restauranteId, activo: true, receta: null, insumoId: { not: null } },
      select: { id: true, insumoId: true },
    });
    for (const r of reventa) {
      const componente = catalogo.get(r.insumoId!);
      if (!componente) continue;
      recetas.set(r.id, {
        rendimiento: 1,
        instrucciones: null,
        lineas: [{ componente, cantidad: 1, unidad: componente.unidadBase, porcentajeMerma: 0 }],
      });
    }
    const exigen = await db.itemMenu.findMany({
      where: { restauranteId, categoria: { requiereReceta: true } },
      select: { id: true },
    });

    const existenciasFilas = await db.existencia.findMany({
      where: { sucursalId, sucursal: { restauranteId } },
      select: {
        id: true,
        componenteId: true,
        cantidadActual: true,
        componente: { select: { nombre: true, unidadBase: true } },
      },
    });
    const existencias: ContextoStock['existencias'] = new Map(
      existenciasFilas.map((x) => [
        x.componenteId,
        {
          existenciaId: x.id,
          nombre: x.componente.nombre,
          unidad: ETIQUETA_UNIDAD[x.componente.unidadBase as UnidadMedida],
          cantidad: Number(x.cantidadActual),
        },
      ]),
    );

    const mesas = await db.mesa.findMany({
      where: { sucursalId, sucursal: { restauranteId }, activa: true },
      select: { capacidad: true },
    });

    // Un día de margen a cada lado: las cenas que cruzan la medianoche son del servicio anterior.
    const reservas = await db.reserva.findMany({
      where: {
        sucursalId,
        sucursal: { restauranteId },
        estado: { in: ['PENDIENTE', 'ACTIVA'] },
        inicio: { gte: aFecha(sumarDias(semanaDesde, -1)), lt: aFecha(sumarDias(semanaDesde, 8)) },
      },
      select: { inicio: true, cantidadPersonas: true },
    });

    const empleadosFilas = await db.empleado.findMany({
      where: {
        restauranteId,
        usuario: { activo: true },
        sucursales: { some: { sucursalId } },
        rol: { arquetipo: { in: ARQUETIPOS_TURNO } },
      },
      select: {
        usuarioId: true,
        nombreCompleto: true,
        horasSemanalesMax: true,
        rol: { select: { arquetipo: true } },
      },
      orderBy: { usuarioId: 'asc' },
    });

    // Turnos de la semana en las otras sucursales: ocupan la franja y suman horas.
    // Los de esta sucursal son los de la planificación que se está reemplazando.
    const otros = await db.turno.findMany({
      where: {
        sucursalId: { not: sucursalId },
        sucursal: { restauranteId },
        empleadoId: { in: empleadosFilas.map((e) => e.usuarioId) },
        fecha: rangoSemana(semanaDesde),
      },
      select: { empleadoId: true, fecha: true, franja: true, sucursalId: true },
    });
    const horariosOtros = await db.horarioServicio.findMany({
      where: { sucursalId: { in: [...new Set(otros.map((t) => t.sucursalId))] } },
    });
    const duracion = new Map(
      horariosOtros.map((h) => [
        `${h.sucursalId}|${h.franja}`,
        horasDeFranja({
          franja: h.franja as Franja,
          horaInicio: aHora(h.horaInicio),
          horaFin: aHora(h.horaFin),
        }),
      ]),
    );

    const empleados = empleadosFilas.map<EmpleadoAsignable>((e) => {
      const suyos = otros.filter((t) => t.empleadoId === e.usuarioId);
      return {
        id: e.usuarioId,
        nombre: e.nombreCompleto,
        arquetipo: e.rol.arquetipo as ArquetipoTurno,
        horasSemanalesMax: e.horasSemanalesMax,
        horasYaAsignadas: suyos.reduce(
          (suma, t) => suma + (duracion.get(`${t.sucursalId}|${t.franja}`) ?? 0),
          0,
        ),
        ocupado: new Set(suyos.map((t) => `${deFecha(t.fecha)}|${t.franja}`)),
      };
    });

    return {
      horarios,
      recetas,
      existencias,
      conReceta: new Set(exigen.map((i) => i.id)),
      capacidadMesas: mesas.map((m) => m.capacidad),
      reservas,
      empleados,
    };
  },
};
