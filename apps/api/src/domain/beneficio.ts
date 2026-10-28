import type { ClaseBeneficio, EstadoBeneficio, TipoCriterio, TipoDescuento } from '@pgim/shared';
import { AppError } from '../lib/errors';

// Reglas de los beneficios (clases unificado v2, paquete 4): vigencia y stock,
// descuento, criterios de elegibilidad (Strategy) y relanzamiento.

export interface DatosBeneficio {
  clase: ClaseBeneficio;
  criterioTipo: TipoCriterio | null;
  criterioValor: number | null;
  tipoDescuento: TipoDescuento;
  valor: number;
  vigenciaDesde: Date;
  vigenciaHasta: Date;
  stockInicial: number | null;
  stockDisponible: number | null;
  activo: boolean;
}

const centavos = (valor: number) => Math.round(valor * 100) / 100;

// Vigente: activo, dentro de la vigencia y con stock (sin límite o mayor que 0).
// Termina al vencer o al agotarse, lo que ocurra primero.
export function estadoBeneficio(b: DatosBeneficio, ahora: Date): EstadoBeneficio {
  if (!b.activo) return 'BAJA';
  if (ahora < b.vigenciaDesde) return 'PROGRAMADO';
  if (ahora >= b.vigenciaHasta) return 'TERMINADO';
  if (b.stockDisponible !== null && b.stockDisponible <= 0) return 'TERMINADO';
  return 'VIGENTE';
}

// Sobre el saldo de la cuenta, con tope en el saldo.
export function calcularDescuento(
  b: Pick<DatosBeneficio, 'tipoDescuento' | 'valor'>,
  saldo: number,
): number {
  const descuento = b.tipoDescuento === 'PORCENTAJE' ? (saldo * b.valor) / 100 : b.valor;
  return centavos(Math.min(descuento, saldo));
}

// Lo que el repositorio cuenta para el comensal en el restaurante. Visitas y
// monto, desde el inicio del ciclo; puntos, el saldo total.
export interface DatosElegibilidad {
  visitas: number;
  montoGastado: number;
  puntos: number;
  tienePagosAprobados: boolean;
}

export interface Progreso {
  actual: number;
  requerido: number;
}

export interface CriterioElegibilidad {
  esElegible(d: DatosElegibilidad): boolean;
  progreso(d: DatosElegibilidad): Progreso;
}

// Criterio con un umbral: elegible al alcanzarlo.
function porUmbral(
  requerido: number,
  medir: (d: DatosElegibilidad) => number,
): CriterioElegibilidad {
  return {
    esElegible: (d) => medir(d) >= requerido,
    progreso: (d) => ({ actual: Math.min(medir(d), requerido), requerido }),
  };
}

const nuevoCliente: CriterioElegibilidad = {
  esElegible: (d) => !d.tienePagosAprobados,
  progreso: (d) => ({ actual: d.tienePagosAprobados ? 0 : 1, requerido: 1 }),
};

// Reconstruye el criterio desde criterio_tipo + criterio_valor. NUEVO_CLIENTE
// ignora el valor (el DER lo exige en toda recompensa).
export function criterioDe(tipo: TipoCriterio, valor: number | null): CriterioElegibilidad {
  switch (tipo) {
    case 'VISITAS':
      return porUmbral(valor ?? 0, (d) => d.visitas);
    case 'MONTO':
      return porUmbral(valor ?? 0, (d) => d.montoGastado);
    case 'PUNTOS':
      return porUmbral(valor ?? 0, (d) => d.puntos);
    case 'NUEVO_CLIENTE':
      return nuevoCliente;
  }
}

// Visitas y monto cuentan desde lo más reciente entre el inicio de la edición
// y el último canje aprobado de esa recompensa.
export function desdeDelCiclo(vigenciaDesde: Date, ultimoCanjeAprobado: Date | null): Date {
  return ultimoCanjeAprobado && ultimoCanjeAprobado > vigenciaDesde
    ? ultimoCanjeAprobado
    : vigenciaDesde;
}

// Sobre lo pagado, redondeando hacia abajo. En centavos enteros para que la
// coma flotante no reste un punto (18750 × 0,01).
export function calcularPuntos(monto: number, tasa: number): number {
  return Math.floor((Math.round(monto * 100) * tasa) / 100 + 1e-9);
}

// Nueva edición desde ahora, con la misma duración y el stock repuesto.
export function relanzar(
  b: DatosBeneficio,
  ahora: Date,
): { vigenciaDesde: Date; vigenciaHasta: Date; stockDisponible: number | null } {
  const estado = estadoBeneficio(b, ahora);
  if (estado === 'VIGENTE') throw new AppError(409, 'No se puede relanzar un beneficio vigente');
  if (estado === 'PROGRAMADO') throw new AppError(409, 'El beneficio todavía no empezó');
  if (estado === 'BAJA') throw new AppError(409, 'El beneficio está dado de baja');
  const duracion = b.vigenciaHasta.getTime() - b.vigenciaDesde.getTime();
  return {
    vigenciaDesde: ahora,
    vigenciaHasta: new Date(ahora.getTime() + duracion),
    stockDisponible: b.stockInicial,
  };
}
