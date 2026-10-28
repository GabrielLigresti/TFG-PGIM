// Fidelización: programa de puntos y beneficios (CU-17) y su lado del comensal.

export const CLASES_BENEFICIO = ['RECOMPENSA', 'PROMOCION'] as const;
export type ClaseBeneficio = (typeof CLASES_BENEFICIO)[number];

export const TIPOS_CRITERIO = ['VISITAS', 'MONTO', 'PUNTOS', 'NUEVO_CLIENTE'] as const;
export type TipoCriterio = (typeof TIPOS_CRITERIO)[number];

export const TIPOS_DESCUENTO = ['PORCENTAJE', 'MONTO_FIJO'] as const;
export type TipoDescuento = (typeof TIPOS_DESCUENTO)[number];

// Calculado a partir de la vigencia, el stock y la baja lógica.
export const ESTADOS_BENEFICIO = ['PROGRAMADO', 'VIGENTE', 'TERMINADO', 'BAJA'] as const;
export type EstadoBeneficio = (typeof ESTADOS_BENEFICIO)[number];
