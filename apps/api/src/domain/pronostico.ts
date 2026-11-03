import {
  minutosFin,
  minutosInicio,
  type ConfiguracionApertura,
  type Franja,
  type MetodoPronostico,
  type ProgresoDatos,
} from '@pgim/shared';
import { horaArgentina } from '../lib/hora';
import { fechaDe, sumarDias } from './franjas';

// Dominio del pronóstico de la semana siguiente: funciones puras, sin Prisma.
// Las fechas son AAAA-MM-DD de Argentina y se comparan como texto.

const DIAS_BACKTEST = 28;
const DIAS_PARTICIPACION = 56; // 8 semanas
const MAPE_MAXIMO = 999.99; // columna numeric(5,2)
const EPSILON = 1e-9;

export interface HorarioServicioDatos {
  franja: Franja;
  horaInicio: string;
  horaFin: string;
}

export interface ReservaHistorial {
  inicio: Date;
  cantidadPersonas: number;
  lineas: { itemMenuId: string; cantidad: number }[];
}

export interface ItemPronostico {
  id: string;
  nombre: string;
  precio: number;
}

export interface HistorialVentas {
  reservas: ReservaHistorial[];
  horarios: HorarioServicioDatos[];
  items: ItemPronostico[];
}

export interface Observacion {
  fecha: string;
  valor: number;
}

export interface FilaPronostico {
  fecha: string;
  franja: Franja;
  cubiertosEstimados: number;
  limiteInferior: number;
  limiteSuperior: number;
  ingresoEstimado: number;
  metodo: MetodoPronostico;
  errorMape: number;
  demanda: { itemMenuId: string; cantidad: number }[];
}

export interface ResultadoPronostico {
  semanaDesde: string;
  progreso: ProgresoDatos;
  filas: FilaPronostico[];
}

const redondear2 = (n: number) => Math.round(n * 100) / 100;

// --- Fechas ------------------------------------------------------------

function diasEntre(desde: string, hasta: string): number {
  return Math.round(
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000,
  );
}

function diaSemana(fecha: string): number {
  return new Date(`${fecha}T00:00:00Z`).getUTCDay();
}

// --- Fecha de servicio y franja ---------------------------------------

// Fecha de servicio y franja de una reserva, o null si cae fuera de todo
// horario. Con un horario que cruza la medianoche (horaFin <= horaInicio, salvo
// 00:00, que es 24:00), las horas de después de la medianoche son del servicio
// del día anterior.
export function servicioDeReserva(
  inicio: Date,
  horarios: HorarioServicioDatos[],
): { fecha: string; franja: Franja } | null {
  const fecha = fechaDe(inicio);
  const minuto = minutosInicio(horaArgentina(inicio));
  for (const h of horarios) {
    const desde = minutosInicio(h.horaInicio);
    const hasta = minutosFin(h.horaFin);
    if (hasta > desde) {
      if (minuto >= desde && minuto < hasta) return { fecha, franja: h.franja };
    } else if (minuto >= desde) {
      return { fecha, franja: h.franja };
    } else if (minuto < hasta) {
      return { fecha: sumarDias(fecha, -1), franja: h.franja };
    }
  }
  return null;
}

// --- Progreso y semana siguiente --------------------------------------

// `inicio` es la fecha de servicio de la primera reserva válida (null si no hay)
// y `fin` es ayer; ambos días cuentan.
export function progresoDatos(inicio: string | null, fin: string, minimo: number): ProgresoDatos {
  const dias = inicio === null || inicio > fin ? 0 : diasEntre(inicio, fin) + 1;
  const semanas = Math.floor(dias / 7);
  return { semanas, minimo, suficiente: semanas >= minimo };
}

// El lunes posterior a hoy (si hoy es lunes, el de la semana próxima) y los
// seis días siguientes.
export function semanaSiguiente(hoy: Date): { desde: string; fechas: string[] } {
  const hoyLocal = fechaDe(hoy);
  const desde = sumarDias(hoyLocal, (8 - diaSemana(hoyLocal)) % 7 || 7);
  return { desde, fechas: Array.from({ length: 7 }, (_, i) => sumarDias(desde, i)) };
}

// --- Estrategias (Strategy) -------------------------------------------

// La serie está ordenada y es anterior a `fecha`.
export interface EstrategiaPronostico {
  pronosticar(serie: Observacion[], fecha: string): number;
}

const entero = (n: number) => Math.max(0, Math.round(n));

const mismoDia = (serie: Observacion[], fecha: string) => {
  const dia = diaSemana(fecha);
  return serie.filter((o) => diaSemana(o.fecha) === dia);
};

export const naiveEstacional: EstrategiaPronostico = {
  pronosticar(serie, fecha) {
    const previas = mismoDia(serie, fecha);
    return entero(previas.at(-1)?.valor ?? 0);
  },
};

const PESOS_PROMEDIO = [4, 3, 2, 1];

export const promedioMovilPonderado: EstrategiaPronostico = {
  pronosticar(serie, fecha) {
    const recientes = mismoDia(serie, fecha).slice(-PESOS_PROMEDIO.length).reverse();
    if (recientes.length === 0) return 0;
    let suma = 0;
    let pesos = 0;
    recientes.forEach((o, i) => {
      suma += PESOS_PROMEDIO[i]! * o.valor;
      pesos += PESOS_PROMEDIO[i]!;
    });
    return entero(suma / pesos);
  },
};

export const regresionEstacional: EstrategiaPronostico = {
  pronosticar(serie, fecha) {
    if (serie.length === 0) return 0;
    const origen = serie[0]!.fecha;
    const semanas = (f: string) => diasEntre(origen, f) / 7;

    const grupos = new Map<number, { t: number; y: number }[]>();
    for (const o of serie) {
      const dia = diaSemana(o.fecha);
      const g = grupos.get(dia) ?? [];
      g.push({ t: semanas(o.fecha), y: o.valor });
      grupos.set(dia, g);
    }
    const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const medias = new Map<number, { t: number; y: number }>();
    let sxy = 0;
    let sxx = 0;
    for (const [dia, g] of grupos) {
      const m = { t: media(g.map((p) => p.t)), y: media(g.map((p) => p.y)) };
      medias.set(dia, m);
      for (const p of g) {
        sxy += (p.t - m.t) * (p.y - m.y);
        sxx += (p.t - m.t) ** 2;
      }
    }
    const b = sxx > 0 ? sxy / sxx : 0;
    const t = semanas(fecha);
    // Un día de la semana sin observaciones usa la media de toda la serie.
    const m = medias.get(diaSemana(fecha)) ?? {
      t: media(serie.map((o) => semanas(o.fecha))),
      y: media(serie.map((o) => o.valor)),
    };
    return entero(m.y - b * m.t + b * t);
  },
};

export const ESTRATEGIAS: Record<MetodoPronostico, EstrategiaPronostico> = {
  PROMEDIO_MOVIL_PONDERADO: promedioMovilPonderado,
  NAIVE_ESTACIONAL: naiveEstacional,
  REGRESION_ESTACIONAL: regresionEstacional,
};

// Orden de desempate.
const ORDEN_METODOS: MetodoPronostico[] = [
  'PROMEDIO_MOVIL_PONDERADO',
  'NAIVE_ESTACIONAL',
  'REGRESION_ESTACIONAL',
];

// --- Backtest y selección ---------------------------------------------

// MAPE (%) sin redondear sobre los últimos 28 días de la serie, pronosticando
// cada uno solo con los anteriores. Null si ninguno tuvo cubiertos reales.
export function backtestMape(
  serie: Observacion[],
  estrategia: EstrategiaPronostico,
): number | null {
  let suma = 0;
  let dias = 0;
  for (let i = Math.max(0, serie.length - DIAS_BACKTEST); i < serie.length; i++) {
    const real = serie[i]!.valor;
    if (real === 0) continue;
    const pronostico = estrategia.pronosticar(serie.slice(0, i), serie[i]!.fecha);
    suma += Math.abs(real - pronostico) / real;
    dias++;
  }
  return dias === 0 ? null : (suma / dias) * 100;
}

export function elegirMetodo(
  serie: Observacion[],
  estrategias: Record<MetodoPronostico, EstrategiaPronostico> = ESTRATEGIAS,
): { metodo: MetodoPronostico; errorMape: number } {
  let mejor: { metodo: MetodoPronostico; mape: number } | null = null;
  for (const metodo of ORDEN_METODOS) {
    const mape = backtestMape(serie, estrategias[metodo]);
    if (mape === null) return { metodo: 'NAIVE_ESTACIONAL', errorMape: 0 };
    if (mejor === null || mape < mejor.mape - EPSILON) mejor = { metodo, mape };
  }
  return { metodo: mejor!.metodo, errorMape: Math.min(redondear2(mejor!.mape), MAPE_MAXIMO) };
}

// --- Rango, demanda e ingreso -----------------------------------------

export function rango(
  cubiertos: number,
  mape: number,
): { limiteInferior: number; limiteSuperior: number } {
  return {
    limiteInferior: Math.max(0, Math.floor(cubiertos * (1 - mape / 100))),
    limiteSuperior: Math.ceil(cubiertos * (1 + mape / 100)),
  };
}

// Participación de cada ítem del menú activo: platos / cubiertos de la franja.
// Cantidad estimada = round(cubiertos × participación); se omiten los ceros.
export function demandaPorItem(
  cubiertosEstimados: number,
  platosPorItem: ReadonlyMap<string, number>,
  cubiertosHistoricos: number,
  items: ItemPronostico[],
): { itemMenuId: string; cantidad: number }[] {
  if (cubiertosHistoricos <= 0) return [];
  const demanda: { itemMenuId: string; cantidad: number }[] = [];
  for (const item of items) {
    const platos = platosPorItem.get(item.id) ?? 0;
    const cantidad = Math.round(cubiertosEstimados * (platos / cubiertosHistoricos));
    if (cantidad > 0) demanda.push({ itemMenuId: item.id, cantidad });
  }
  return demanda;
}

export function ingresoEstimado(
  demanda: { itemMenuId: string; cantidad: number }[],
  items: ItemPronostico[],
): number {
  const precios = new Map(items.map((i) => [i.id, i.precio]));
  return redondear2(demanda.reduce((s, d) => s + d.cantidad * (precios.get(d.itemMenuId) ?? 0), 0));
}

// --- Orquestación ------------------------------------------------------

interface ServicioAgregado {
  cubiertos: number;
  platos: Map<string, number>;
}

export function pronosticarSemana(
  historial: HistorialVentas,
  config: Pick<ConfiguracionApertura, 'semanasHistoricoMinimo'>,
  hoy: Date,
): ResultadoPronostico {
  const { desde: semanaDesde, fechas } = semanaSiguiente(hoy);
  const fin = sumarDias(fechaDe(hoy), -1);

  // Agrupa las reservas por franja y fecha de servicio, ignorando las que no
  // caen en ningún horario o son posteriores a ayer.
  const servicios = new Map<Franja, Map<string, ServicioAgregado>>();
  let inicio: string | null = null;
  for (const r of historial.reservas) {
    const s = servicioDeReserva(r.inicio, historial.horarios);
    if (!s || s.fecha > fin) continue;
    if (inicio === null || s.fecha < inicio) inicio = s.fecha;
    const porFecha = servicios.get(s.franja) ?? new Map<string, ServicioAgregado>();
    const acum = porFecha.get(s.fecha) ?? { cubiertos: 0, platos: new Map<string, number>() };
    acum.cubiertos += r.cantidadPersonas;
    for (const l of r.lineas)
      acum.platos.set(l.itemMenuId, (acum.platos.get(l.itemMenuId) ?? 0) + l.cantidad);
    porFecha.set(s.fecha, acum);
    servicios.set(s.franja, porFecha);
  }

  const progreso = progresoDatos(inicio, fin, config.semanasHistoricoMinimo);
  if (!progreso.suficiente || inicio === null) return { semanaDesde, progreso, filas: [] };

  const franjas = [...new Set(historial.horarios.map((h) => h.franja))];
  const filas: FilaPronostico[] = [];
  const dias = diasEntre(inicio, fin) + 1;
  const fechasHistorial = Array.from({ length: dias }, (_, i) => sumarDias(inicio, i));

  for (const franja of franjas) {
    const porFecha = servicios.get(franja);
    const serie = fechasHistorial.map((fecha) => ({
      fecha,
      valor: porFecha?.get(fecha)?.cubiertos ?? 0,
    }));
    const { metodo, errorMape } = elegirMetodo(serie);

    // Participación sobre las últimas 8 semanas del historial.
    const platos = new Map<string, number>();
    let cubiertosHistoricos = 0;
    for (const fecha of fechasHistorial.slice(-DIAS_PARTICIPACION)) {
      const s = porFecha?.get(fecha);
      if (!s) continue;
      cubiertosHistoricos += s.cubiertos;
      for (const [id, n] of s.platos) platos.set(id, (platos.get(id) ?? 0) + n);
    }

    for (const fecha of fechas) {
      const e = ESTRATEGIAS[metodo].pronosticar(serie, fecha);
      const demanda = demandaPorItem(e, platos, cubiertosHistoricos, historial.items);
      filas.push({
        fecha,
        franja,
        cubiertosEstimados: e,
        ...rango(e, errorMape),
        ingresoEstimado: ingresoEstimado(demanda, historial.items),
        metodo,
        errorMape,
        demanda,
      });
    }
  }
  return { semanaDesde, progreso, filas };
}
