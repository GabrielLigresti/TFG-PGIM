import { z } from 'zod';
import type { Referencia } from './comun';

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

// ─── Panel (CU-17) ───────────────────────────────────────────────────────────

export const MAX_PUNTOS_POR_UNIDAD = 1000;

export const programaInputSchema = z.object({
  puntosPorUnidad: z
    .number()
    .positive('La tasa tiene que ser mayor que 0')
    .max(MAX_PUNTOS_POR_UNIDAD)
    .refine((v) => Math.abs(v * 1e4 - Math.round(v * 1e4)) < 1e-6, 'Usá hasta 4 decimales'),
});
export type ProgramaInput = z.infer<typeof programaInputSchema>;

export interface ProgramaPanel {
  puntosPorUnidad: number;
}

export const grupoInputSchema = z.object({
  nombre: z.string().trim().min(1, 'Ingresá un nombre').max(60),
});
export type GrupoInput = z.infer<typeof grupoInputSchema>;

export interface GrupoPanel {
  id: string;
  nombre: string;
  cantidadBeneficios: number;
}

// Un solo objeto (no una unión por clase) para que el formulario del panel
// lo arme sin ramas; las reglas por clase y por criterio van en el refine.
export const beneficioInputSchema = z
  .object({
    nombre: z.string().trim().min(1, 'Ingresá un nombre').max(80),
    clase: z.enum(CLASES_BENEFICIO),
    grupoId: z.uuid().nullish(),
    menuId: z.uuid().nullish(),
    criterioTipo: z.enum(TIPOS_CRITERIO).nullish(),
    criterioValor: z.number().nullish(),
    tipoDescuento: z.enum(TIPOS_DESCUENTO),
    valor: z.number().positive('El descuento tiene que ser mayor que 0').max(1e9),
    vigenciaDesde: z.iso.datetime({ offset: true }),
    vigenciaHasta: z.iso.datetime({ offset: true }),
    stockInicial: z.number().int().min(1, 'El stock tiene que ser al menos 1').max(1e6).nullish(),
  })
  .superRefine((b, ctx) => {
    const error = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (b.tipoDescuento === 'PORCENTAJE' && b.valor > 100) {
      error('valor', 'El porcentaje no puede superar 100');
    }
    if (new Date(b.vigenciaHasta) <= new Date(b.vigenciaDesde)) {
      error('vigenciaHasta', 'El fin tiene que ser posterior al inicio');
    }
    if (b.clase === 'PROMOCION') {
      if (!b.menuId) error('menuId', 'Elegí el menú de la promoción');
      return;
    }
    if (!b.criterioTipo) {
      error('criterioTipo', 'Elegí la condición de la recompensa');
      return;
    }
    if (b.criterioTipo === 'NUEVO_CLIENTE') return;
    const v = b.criterioValor;
    if (v === null || v === undefined || v <= 0) {
      error('criterioValor', 'Ingresá un valor mayor que 0');
    } else if (b.criterioTipo !== 'MONTO' && !Number.isInteger(v)) {
      error('criterioValor', 'Ingresá un número entero');
    }
  });
export type BeneficioInput = z.infer<typeof beneficioInputSchema>;

export const filtrosBeneficioSchema = z.object({
  clase: z.enum(CLASES_BENEFICIO).optional(),
  grupoId: z.uuid().optional(),
});

export interface BeneficioPanel {
  id: string;
  nombre: string;
  clase: ClaseBeneficio;
  grupo: Referencia | null;
  menu: Referencia | null;
  criterioTipo: TipoCriterio | null;
  criterioValor: number | null;
  tipoDescuento: TipoDescuento;
  valor: number;
  vigenciaDesde: string;
  vigenciaHasta: string;
  stockInicial: number | null;
  stockDisponible: number | null;
  estado: EstadoBeneficio;
  // Pagos PENDIENTE que lo usan: mientras haya, no se relanza.
  pagosEnCurso: number;
}

// ─── Comensal ────────────────────────────────────────────────────────────────

export type UnidadProgreso = 'visitas' | 'pesos' | 'puntos' | 'primera visita';

export interface ProgresoBeneficio {
  actual: number;
  requerido: number;
  unidad: UnidadProgreso;
}

export interface BeneficioDisponible {
  id: string;
  nombre: string;
  // "10 % de descuento", "$ 3.000 de descuento".
  descripcion: string;
  // Sobre el saldo actual de la mesa.
  descuento: number;
}

export interface BeneficioNoAlcanzado {
  id: string;
  nombre: string;
  descripcion: string;
  progreso: ProgresoBeneficio;
}

// Lo que el comensal puede elegir al pagar y lo que le falta para el resto.
export interface BeneficiosMesa {
  disponibles: BeneficioDisponible[];
  noAlcanzados: BeneficioNoAlcanzado[];
  // La mesa ya usó un beneficio en un pago aprobado (uno por mesa).
  beneficioUsado: boolean;
}

export interface RecompensaComensal extends BeneficioNoAlcanzado {
  alcanzada: boolean;
}

// "Mis puntos": una tarjeta por restaurante donde el comensal tiene cuenta.
export interface FidelidadComensal {
  restaurante: Referencia;
  puntos: number;
  visitas: number;
  // Sin programa, el restaurante no acredita puntos (sí visitas).
  programa: boolean;
  recompensas: RecompensaComensal[];
}
