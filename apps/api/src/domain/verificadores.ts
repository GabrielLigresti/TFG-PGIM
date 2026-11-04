import type { Arquetipo, Franja, Severidad, TipoAlertaSimulador } from '@pgim/shared';
import { capacidadDeFranja } from './capacidad';
import { insumosNecesarios, type Componente, type Receta } from './receta';

// Verificadores del simulador de apertura (Strategy): cada uno recibe los
// pronósticos de la semana, ordenados por fecha y con el almuerzo antes que
// la cena, y devuelve las alertas nuevas.

export interface PronosticoAVerificar {
  id: string;
  fecha: string;
  franja: Franja;
  cubiertosEstimados: number;
  demanda: { itemMenuId: string; cantidad: number }[];
}

export interface AlertaNueva {
  tipo: TipoAlertaSimulador;
  severidad: Severidad;
  descripcion: string;
  pronosticoId: string | null;
  existenciaId: string | null;
  fecha: string;
  franja: Franja;
  arquetipo: Arquetipo | null;
  cantidad: number;
}

export interface Verificador {
  verificar(pronosticos: PronosticoAVerificar[]): AlertaNueva[];
}

export interface ContextoStock {
  semanaDesde: string;
  recetas: Map<string, Receta>; // por itemMenuId
  existencias: Map<
    string,
    { existenciaId: string | null; nombre: string; unidad: string; cantidad: number }
  >; // por componenteId
}

export interface ContextoMesas {
  capacidadMesas: number[];
  horasPorFranja: Map<Franja, number>;
  reservados: Map<string, number>; // clave `${fecha}|${franja}`
}

const EPSILON = 1e-9;
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// "viernes a la noche", "sábado al mediodía".
export function momentoLegible(fecha: string, franja: Franja): string {
  const dia = DIAS[new Date(`${fecha}T00:00:00Z`).getUTCDay()]!;
  return `${dia} ${franja === 'CENA' ? 'a la noche' : 'al mediodía'}`;
}

function diasDesde(desde: string, fecha: string): number {
  return Math.round(
    (Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000,
  );
}

// Nombres de los componentes de las recetas, para nombrar un insumo que no
// tiene Existencia en la sucursal.
function nombresDe(recetas: Map<string, Receta>): Map<string, string> {
  const nombres = new Map<string, string>();
  const visitar = (c: Componente) => {
    if (nombres.has(c.id)) return;
    nombres.set(c.id, c.nombre);
    c.receta?.lineas.forEach((l) => visitar(l.componente));
  };
  for (const r of recetas.values()) r.lineas.forEach((l) => visitar(l.componente));
  return nombres;
}

export function crearVerificadorStock(c: ContextoStock): Verificador {
  return {
    verificar(pronosticos) {
      const nombres = nombresDe(c.recetas);
      const acumulado = new Map<string, number>();
      const primera = new Map<string, PronosticoAVerificar>();
      const disponible = (id: string) => c.existencias.get(id)?.cantidad ?? 0;

      for (const p of pronosticos) {
        for (const { itemMenuId, cantidad } of p.demanda) {
          const receta = c.recetas.get(itemMenuId);
          if (!receta) continue; // plato sin receta: no aporta consumo
          for (const [id, valor] of insumosNecesarios(receta, cantidad)) {
            acumulado.set(id, (acumulado.get(id) ?? 0) + valor);
          }
        }
        for (const [id, total] of acumulado) {
          if (!primera.has(id) && total > disponible(id) + EPSILON) primera.set(id, p);
        }
      }

      const alertas: AlertaNueva[] = [];
      for (const [id, p] of primera) {
        const existencia = c.existencias.get(id);
        const nombre = existencia?.nombre ?? nombres.get(id) ?? 'un insumo';
        const faltante = Math.ceil(acumulado.get(id)! - disponible(id) - EPSILON);
        const unidad = existencia?.unidad ? ` ${existencia.unidad}` : '';
        alertas.push({
          tipo: 'FALTANTE_STOCK_PREVISTO',
          severidad: diasDesde(c.semanaDesde, p.fecha) < 2 ? 'CRITICA' : 'ADVERTENCIA',
          descripcion: `Con el stock de hoy, no alcanza ${nombre} desde el ${momentoLegible(p.fecha, p.franja)}: faltan ${faltante}${unidad} para la semana.`,
          pronosticoId: p.id,
          existenciaId: existencia?.existenciaId ?? null,
          fecha: p.fecha,
          franja: p.franja,
          arquetipo: null,
          cantidad: faltante,
        });
      }
      return alertas;
    },
  };
}

export function crearVerificadorMesas(c: ContextoMesas): Verificador {
  return {
    verificar(pronosticos) {
      const alertas: AlertaNueva[] = [];
      for (const p of pronosticos) {
        const capacidad = capacidadDeFranja(c.capacidadMesas, c.horasPorFranja.get(p.franja) ?? 0);
        const reservados = c.reservados.get(`${p.fecha}|${p.franja}`) ?? 0;
        const demanda = Math.max(p.cubiertosEstimados, reservados);
        if (demanda <= capacidad) continue;
        const exceso = Math.ceil(demanda - capacidad);
        alertas.push({
          tipo: 'CAPACIDAD_MESAS',
          severidad: 'ADVERTENCIA',
          descripcion: `El ${momentoLegible(p.fecha, p.franja)} se esperan ${Math.ceil(demanda)} cubiertos y las mesas activas alcanzan para ${capacidad}: sobran ${exceso}.`,
          pronosticoId: p.id,
          existenciaId: null,
          fecha: p.fecha,
          franja: p.franja,
          arquetipo: null,
          cantidad: exceso,
        });
      }
      return alertas;
    },
  };
}
