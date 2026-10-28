import { hoyArgentina, type BeneficioPanel, type TipoCriterio } from '@pgim/shared';
import { formatoFecha, formatoPesos, sumarDias } from './formato';

// Textos de los beneficios para el panel, en el lenguaje del restaurante.

export const NOMBRE_CRITERIO: Record<TipoCriterio, string> = {
  VISITAS: 'Cantidad de visitas',
  MONTO: 'Monto gastado',
  PUNTOS: 'Canje de puntos',
  NUEVO_CLIENTE: 'Primera visita',
};

export function textoCondicion(
  b: Pick<BeneficioPanel, 'clase' | 'criterioTipo' | 'criterioValor' | 'menu'>,
) {
  if (b.clase === 'PROMOCION') return b.menu ? `Menú ${b.menu.nombre}` : 'Promoción';
  const v = b.criterioValor ?? 0;
  switch (b.criterioTipo) {
    case 'VISITAS':
      return `${v} ${v === 1 ? 'visita' : 'visitas'}`;
    case 'MONTO':
      return `${formatoPesos(v)} gastados`;
    case 'PUNTOS':
      return `${v} puntos`;
    default:
      return 'Primera visita';
  }
}

export const textoDescuento = (b: Pick<BeneficioPanel, 'tipoDescuento' | 'valor'>) =>
  b.tipoDescuento === 'PORCENTAJE' ? `${b.valor} %` : formatoPesos(b.valor);

// La vigencia se carga por días en hora de Argentina: empieza a las 00:00 del
// primer día y termina al final del último (00:00 del día siguiente).
export const inicioDelDia = (fecha: string) => `${fecha}T00:00:00-03:00`;
export const finDelDia = (fecha: string) => `${sumarDias(fecha, 1)}T00:00:00-03:00`;
export const diaDe = (instante: string) => hoyArgentina(new Date(instante));
export const ultimoDiaDe = (finExclusivo: string) => sumarDias(diaDe(finExclusivo), -1);

export const textoVigencia = (b: Pick<BeneficioPanel, 'vigenciaDesde' | 'vigenciaHasta'>) =>
  `${formatoFecha(diaDe(b.vigenciaDesde))} al ${formatoFecha(ultimoDiaDe(b.vigenciaHasta))}`;

export const textoStock = (b: Pick<BeneficioPanel, 'stockInicial' | 'stockDisponible'>) =>
  b.stockInicial === null ? 'Sin límite' : `${b.stockDisponible} de ${b.stockInicial}`;
