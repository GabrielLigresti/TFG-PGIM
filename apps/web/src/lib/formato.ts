import { ETIQUETA_UNIDAD, type UnidadMedida } from '@pgim/shared';

const pesos = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 2,
});

const numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });

export const formatoPesos = (valor: number) => pesos.format(valor);

export const formatoCantidad = (valor: number, unidad?: UnidadMedida) =>
  unidad ? `${numero.format(valor)} ${ETIQUETA_UNIDAD[unidad]}` : numero.format(valor);

// Los inputs numéricos se manejan como texto; vacío o inválido es NaN y lo
// rechaza la validación de la API con su mensaje.
export const aNumero = (texto: string) =>
  texto.trim() === '' ? Number.NaN : Number(texto.replace(',', '.'));

export const NOMBRE_UNIDAD: Record<UnidadMedida, string> = {
  GRAMO: 'Gramos (g)',
  KILOGRAMO: 'Kilogramos (kg)',
  MILILITRO: 'Mililitros (ml)',
  LITRO: 'Litros (l)',
  UNIDAD: 'Unidades',
};
