import {
  administraModulo,
  errorDePeriodo,
  hoyArgentina,
  resolverPeriodo,
  type CodigoPermiso,
  type ConsultaMetricas,
  type Franja,
  type Metricas,
  type Referencia,
} from '@pgim/shared';
import { capacidadDeFranja, horasDeFranja } from '../domain/capacidad';
import { fechaDe, sumarDias } from '../domain/franjas';
import { progresoDatos, semanaSiguiente, servicioDeReserva } from '../domain/pronostico';
import { AppError } from '../lib/errors';
import { aperturaRepository, type AperturaRepository } from '../repositories/apertura.repository';
import { metricaRepository, type MetricaRepository } from '../repositories/metrica.repository';

export interface ContextoMetricas {
  restauranteId: string;
  permisos: readonly CodigoPermiso[];
  // Sucursales asignadas al usuario en Personal.
  sucursales: Referencia[];
}

const FRANJAS_EN_ORDEN: Franja[] = ['ALMUERZO', 'CENA'];
const aCentavos = (monto: number) => Math.round(monto * 100);
const deCentavos = (centavos: number) => centavos / 100;
const redondear = (n: number, decimales: number) => {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
};
const porcentaje = (cubiertos: number, capacidad: number) =>
  capacidad > 0 ? redondear((cubiertos / capacidad) * 100, 1) : null;

function diasDelPeriodo(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) dias.push(d);
  return dias;
}

// Métricas del gerente (CU-19): solo lectura, nunca genera pronósticos. El
// alcance por sucursal se decide acá; los repositorios reciben la lista resuelta.
export function createMetricaService(repo: MetricaRepository, apertura: AperturaRepository) {
  async function alcanceDe(ctx: ContextoMetricas) {
    const todas = administraModulo(ctx.permisos, 'sucursal');
    const sucursales = todas ? await repo.sucursalesActivas(ctx.restauranteId) : ctx.sucursales;
    const etiquetaTotal =
      sucursales.length < 2 ? null : todas ? 'Todas las sucursales' : 'Mis sucursales';
    return { sucursales, etiquetaTotal } as const;
  }

  async function ocupacion(
    ctx: ContextoMetricas,
    ids: string[],
    desde: string,
    hasta: string,
  ): Promise<Metricas['ocupacion']> {
    const dias = diasDelPeriodo(desde, hasta);
    const cubiertos = new Map<Franja, number>();
    const capacidad = new Map<Franja, number>();
    for (const s of await repo.datosDeOcupacion(ctx.restauranteId, ids, desde, hasta)) {
      for (const h of s.horarios) {
        const porDia = capacidadDeFranja(s.capacidadesMesas, horasDeFranja(h));
        capacidad.set(h.franja, (capacidad.get(h.franja) ?? 0) + porDia * dias.length);
        cubiertos.set(h.franja, cubiertos.get(h.franja) ?? 0);
      }
      for (const r of s.reservas) {
        const servicio = servicioDeReserva(r.inicio, s.horarios);
        if (!servicio || servicio.fecha < desde || servicio.fecha > hasta) continue;
        cubiertos.set(servicio.franja, (cubiertos.get(servicio.franja) ?? 0) + r.cantidadPersonas);
      }
    }
    const suma = (m: Map<Franja, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    return {
      porcentaje: porcentaje(suma(cubiertos), suma(capacidad)),
      porFranja: FRANJAS_EN_ORDEN.filter((f) => capacidad.has(f)).map((franja) => ({
        franja,
        porcentaje: porcentaje(cubiertos.get(franja) ?? 0, capacidad.get(franja) ?? 0),
      })),
    };
  }

  async function proyeccion(
    ctx: ContextoMetricas,
    seleccion: Referencia[],
    ahora: Date,
  ): Promise<Metricas['proyeccion']> {
    const { desde: semanaDesde } = semanaSiguiente(ahora);
    const ayer = sumarDias(fechaDe(ahora), -1);
    let total = 0;
    const excluidas: Metricas['proyeccion']['excluidas'] = [];
    const sinPronostico: string[] = [];
    for (const s of seleccion) {
      const config = await apertura.obtenerConfiguracion(ctx.restauranteId, s.id);
      if (!config) continue;
      const historial = await apertura.historial(ctx.restauranteId, s.id);
      let inicio: string | null = null;
      for (const r of historial.reservas) {
        const servicio = servicioDeReserva(r.inicio, historial.horarios);
        if (servicio && servicio.fecha <= ayer && (inicio === null || servicio.fecha < inicio)) {
          inicio = servicio.fecha;
        }
      }
      const progreso = progresoDatos(inicio, ayer, config.semanasHistoricoMinimo);
      if (!progreso.suficiente) {
        excluidas.push({ sucursal: s.nombre, semanas: progreso.semanas, minimo: progreso.minimo });
        continue;
      }
      const filas = await apertura.pronosticosDeSemana(ctx.restauranteId, s.id, semanaDesde);
      if (filas.length === 0) sinPronostico.push(s.nombre);
      for (const f of filas) total += aCentavos(f.ingresoEstimado);
    }
    return { total: deCentavos(total), semanaDesde, excluidas, sinPronostico };
  }

  return {
    async consultar(
      ctx: ContextoMetricas,
      consulta: ConsultaMetricas,
      ahora: Date,
    ): Promise<Metricas> {
      const periodo = resolverPeriodo(consulta, hoyArgentina(ahora));
      const errorPeriodo = errorDePeriodo(periodo.desde, periodo.hasta);
      if (errorPeriodo) throw new AppError(400, errorPeriodo);

      const alcance = await alcanceDe(ctx);
      let seleccion = alcance.sucursales;
      if (consulta.sucursalId) {
        const elegida = alcance.sucursales.find((s) => s.id === consulta.sucursalId);
        if (!elegida) throw new AppError(403, 'No tenés acceso a esa sucursal');
        seleccion = [elegida];
      }
      const ids = seleccion.map((s) => s.id);
      const { desde, hasta } = periodo;
      const r = ctx.restauranteId;

      // Sin sucursales no hay nada que consultar: ceros y listas vacías.
      const [pagos, lineas, merma] = ids.length
        ? await Promise.all([
            repo.pagosAprobados(r, ids, desde, hasta),
            repo.lineasEntregadas(r, ids, desde, hasta),
            repo.mermaPorMotivo(r, ids, desde, hasta),
          ])
        : [[], [], []];
      const costos = await repo.costosDePlatos(
        r,
        lineas.map((l) => l.itemMenuId),
      );

      const porDia = new Map<string, number>();
      for (const p of pagos) {
        const dia = fechaDe(p.fecha);
        porDia.set(dia, (porDia.get(dia) ?? 0) + aCentavos(p.monto));
      }
      const totalVentas = [...porDia.values()].reduce((a, b) => a + b, 0);

      const porUnidades = [...lineas].sort(
        (a, b) => b.unidades - a.unidades || a.nombre.localeCompare(b.nombre),
      );

      const margen = lineas.map((l) => {
        const costo = costos.get(l.itemMenuId) ?? null;
        const precioPromedio = l.unidades > 0 ? l.ingresos / l.unidades : 0;
        return {
          itemMenuId: l.itemMenuId,
          nombre: l.nombre,
          unidades: l.unidades,
          precioPromedio: redondear(precioPromedio, 2),
          costo: costo === null ? null : redondear(costo, 2),
          margenUnitario: costo === null ? null : redondear(precioPromedio - costo, 2),
          margenTotal: costo === null ? null : redondear(l.ingresos - costo * l.unidades, 2),
        };
      });
      margen.sort((a, b) => {
        if (a.margenTotal === null || b.margenTotal === null) {
          return Number(a.margenTotal === null) - Number(b.margenTotal === null);
        }
        return b.margenTotal - a.margenTotal;
      });

      const totalMerma = merma.reduce((suma, m) => suma + m.valor, 0);

      return {
        periodo,
        alcance: { sucursales: alcance.sucursales, etiquetaTotal: alcance.etiquetaTotal },
        ventas: {
          total: deCentavos(totalVentas),
          porDia: [...porDia]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([fecha, monto]) => ({ fecha, monto: deCentavos(monto) })),
        },
        platosMasPedidos: porUnidades
          .slice(0, 10)
          .map(({ itemMenuId, nombre, unidades }) => ({ itemMenuId, nombre, unidades })),
        margenPorPlato: margen,
        merma: {
          total: redondear(totalMerma, 2),
          porMotivo: merma
            .map((m) => ({ motivo: m.motivo, valor: redondear(m.valor, 2) }))
            .sort((a, b) => b.valor - a.valor),
        },
        ocupacion: ids.length
          ? await ocupacion(ctx, ids, desde, hasta)
          : { porcentaje: null, porFranja: [] },
        proyeccion: await proyeccion(ctx, seleccion, ahora),
      };
    },
  };
}

export const metricaService = createMetricaService(metricaRepository, aperturaRepository);
