import type { ReservaPanel } from '@pgim/shared';
import { limiteDeLlegada, puedeActivarse } from '../domain/reserva';
import type { FilaReservaPanel } from '../repositories/reserva.repository';

// La reserva como la ve el panel del personal, calculada a la hora `ahora`.
export function aReservaPanel(fila: FilaReservaPanel, ahora: Date): ReservaPanel {
  const ctx = { inicio: fila.inicio, toleranciaNoShowMin: fila.toleranciaNoShowMin, ahora };
  return {
    id: fila.id,
    comensal: { nombre: fila.comensalNombre, telefono: fila.comensalTelefono },
    mesa: { id: fila.mesaId, numero: fila.mesaNumero },
    inicio: fila.inicio.toISOString(),
    cantidadPersonas: fila.cantidadPersonas,
    estado: fila.estado,
    limiteLlegada: limiteDeLlegada(ctx).toISOString(),
    activable: fila.estado === 'PENDIENTE' && puedeActivarse(ctx),
    cerrable: fila.estado === 'ACTIVA',
    pagoEnCurso: fila.estado === 'ACTIVA' && fila.pagoEnCurso,
    cancelable: fila.estado === 'PENDIENTE' && ahora <= limiteDeLlegada(ctx),
  };
}
