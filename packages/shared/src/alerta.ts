import type { Referencia } from './comun';
import type { CodigoPermiso } from './permisos';

// Alertas del panel. Las de stock (secuencia de CU-04) se ven con
// stock.registrar; las de inasistencia (CU-21), con reserva.ver.

export type TipoAlertaStock = 'STOCK_INSUFICIENTE' | 'PLATO_SIN_RECETA';
export type TipoAlertaPanel = TipoAlertaStock | 'INASISTENCIA';
export type Severidad = 'INFO' | 'ADVERTENCIA' | 'CRITICA';

export interface AlertaPanel {
  id: string;
  tipo: TipoAlertaPanel;
  severidad: Severidad;
  descripcion: string;
  creadaEn: string;
  insumo: Referencia | null;
  plato: Referencia | null;
}

// Tipos de alerta que ve una sesión según sus permisos.
export function tiposAlertaVisibles(permisos: readonly CodigoPermiso[]): TipoAlertaPanel[] {
  const tipos: TipoAlertaPanel[] = [];
  if (permisos.includes('stock.registrar')) tipos.push('STOCK_INSUFICIENTE', 'PLATO_SIN_RECETA');
  if (permisos.includes('reserva.ver')) tipos.push('INASISTENCIA');
  return tipos;
}
