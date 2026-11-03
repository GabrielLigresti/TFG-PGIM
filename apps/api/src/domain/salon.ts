import type { EstadoMesaSalon, EstadoReserva } from '@pgim/shared';
import { puedeActivarse } from './reserva';

// Estado de una mesa en el salón en vivo. No usa ocupaLaMesa: esa función da
// por terminada una reserva activa al final de su franja, y acá una mesa con
// gente sentada sigue ocupada hasta el cierre.
export function situacionDeMesa<
  T extends { estado: EstadoReserva; inicio: Date; toleranciaNoShowMin: number },
>(reservas: T[], ahora: Date): { estado: EstadoMesaSalon; reserva: T | null } {
  const activa = reservas
    .filter((r) => r.estado === 'ACTIVA')
    .reduce<T | null>(
      (mejor, r) => (mejor === null || r.inicio.getTime() > mejor.inicio.getTime() ? r : mejor),
      null,
    );
  if (activa) return { estado: 'OCUPADA', reserva: activa };

  const pendiente = reservas
    .filter((r) => r.estado === 'PENDIENTE' && puedeActivarse({ ...r, ahora }))
    .reduce<T | null>(
      (mejor, r) => (mejor === null || r.inicio.getTime() < mejor.inicio.getTime() ? r : mejor),
      null,
    );
  if (pendiente) return { estado: 'RESERVADA', reserva: pendiente };

  return { estado: 'LIBRE', reserva: null };
}
