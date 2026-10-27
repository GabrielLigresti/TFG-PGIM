import type { Referencia } from './comun';

// Alertas de stock del panel (secuencia de CU-04): se ven con stock.registrar.

export type TipoAlertaStock = 'STOCK_INSUFICIENTE' | 'PLATO_SIN_RECETA';
export type Severidad = 'INFO' | 'ADVERTENCIA' | 'CRITICA';

export interface AlertaPanel {
  id: string;
  tipo: TipoAlertaStock;
  severidad: Severidad;
  descripcion: string;
  creadaEn: string;
  insumo: Referencia | null;
  plato: Referencia | null;
}
