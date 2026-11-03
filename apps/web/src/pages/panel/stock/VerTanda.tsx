import type { ComponenteStock, TandaDetalle } from '@pgim/shared';
import { EstadoCarga, Modal } from '../../../components/ui';
import { useRecurso } from '../../../lib/useRecurso';
import { DetalleTanda } from './DetalleTanda';

// Detalle de una tanda en un diálogo; lo usan el historial de producción y el de movimientos.
export function VerTanda({
  id,
  sucursal,
  componentes,
  onCerrar,
}: {
  id: string;
  sucursal: string;
  componentes: ComponenteStock[];
  onCerrar(): void;
}) {
  const detalle = useRecurso<TandaDetalle>(`/stock/produccion/${id}?sucursal=${sucursal}`);
  const unidadBase = componentes.find((c) => c.id === detalle.datos?.intermedio.id)?.unidadBase;

  return (
    <Modal titulo="Detalle de la tanda" onCerrar={onCerrar} ancho="max-w-2xl">
      <EstadoCarga cargando={detalle.cargando && !detalle.datos} error={detalle.error} />
      {detalle.datos && detalle.datos.id === id && (
        <DetalleTanda tanda={detalle.datos} unidadBase={unidadBase} />
      )}
    </Modal>
  );
}
