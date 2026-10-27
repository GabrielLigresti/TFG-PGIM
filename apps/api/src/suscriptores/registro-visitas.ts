import type { BusEventos } from '../domain/eventos';
import type { CuentaMesaRepository } from '../repositories/cuenta-mesa.repository';

// RegistroVisitas (Observer): al cerrarse la mesa, registra la visita del
// titular si pagó. Los puntos se acreditan con el pago, en el Hito 5.
export function registrarRegistroVisitas(
  bus: BusEventos,
  repo: Pick<CuentaMesaRepository, 'registrarVisita'>,
): () => void {
  return bus.suscribir((evento) => {
    if (evento.tipo !== 'CUENTA_MESA_CERRADA') return;
    repo
      .registrarVisita(evento.cuentaMesaId, evento.restauranteId, evento.comensalId)
      .catch((e: unknown) => console.error('No se pudo registrar la visita', e));
  });
}
