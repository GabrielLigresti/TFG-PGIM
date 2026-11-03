import type { DesvioTanda, UnidadBase } from '@pgim/shared';
import { formatoCantidadLegible } from '../../../lib/formato';

// Un rendimiento menor a 95 % o una pérdida de al menos el 5 % del costo teórico marca la tanda.
const RENDIMIENTO_MINIMO = 95;
const PERDIDA_MINIMA = 0.05;

export const rendimientoPorcentaje = (desvio: DesvioTanda) => desvio.rendimientoReal * 100;

export const conPerdidaSignificativa = (desvio: DesvioTanda) =>
  desvio.total > 0 && desvio.total >= desvio.costoTeorico * PERDIDA_MINIMA;

export const marcaTanda = (desvio: DesvioTanda): 'EN_RANGO' | 'CON_PERDIDA' =>
  rendimientoPorcentaje(desvio) < RENDIMIENTO_MINIMO || conPerdidaSignificativa(desvio)
    ? 'CON_PERDIDA'
    : 'EN_RANGO';

// Sin decimales, salvo cerca del límite, para que la marca se entienda.
export function formatoRendimiento(desvio: DesvioTanda): string {
  const p = rendimientoPorcentaje(desvio);
  const digitos = p >= 94.5 && p <= 95.5 ? 1 : 0;
  return `${p.toLocaleString('es-AR', { minimumFractionDigits: digitos, maximumFractionDigits: digitos })} %`;
}

// Diferencia con signo ("+600 g"); vacía si no hay diferencia.
export function formatoDiferencia(valor: number, unidad: UnidadBase): string {
  // Lo usado se precarga redondeado: una diferencia menor a ese redondeo no es un cambio.
  const minimo = unidad === 'UNIDAD' ? 0.005 : 0.5;
  if (Math.abs(valor) < minimo) return '';
  return `${valor > 0 ? '+' : '−'}${formatoCantidadLegible(Math.abs(valor), unidad)}`;
}

// El costo se guarda por unidad base; en pantalla va por kg, l o unidad.
export function costoPorUnidad(costo: number, unidad: UnidadBase | undefined) {
  if (unidad === 'GRAMO') return { etiqueta: 'Costo por kg', valor: costo * 1000 };
  if (unidad === 'MILILITRO') return { etiqueta: 'Costo por l', valor: costo * 1000 };
  return { etiqueta: 'Costo por unidad', valor: costo };
}
