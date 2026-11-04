import { useState } from 'react';
import type { BloqueoCierre, ReservaPanel } from '@pgim/shared';
import { useAvisos } from '../components/AvisoEmergente';
import { useConfirmar } from '../components/Confirmacion';
import { ApiError, api } from './api';
import { formatoPesos } from './formato';

// Cierre de mesa (CU-18). Con saldo pendiente o un pago en revisión la API pide
// confirmación; con pedidos sin entregar, no cierra.
export function useCerrarMesa(recargar: () => void) {
  const confirmar = useConfirmar();
  const { avisar } = useAvisos();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Última reserva cerrada bien: hasta que llegue la lista nueva no se vuelve a ofrecer cerrarla.
  const [cerradaId, setCerradaId] = useState<string | null>(null);

  async function enviarCierre(
    r: Pick<ReservaPanel, 'id' | 'mesa'>,
    confirmarSaldo: boolean,
  ): Promise<void> {
    setError(null);
    setEnviando(true);
    try {
      await api(`/reservas/${r.id}/cerrar`, {
        method: 'POST',
        body: { confirmarSaldo },
      });
      avisar(`Mesa ${r.mesa.numero} cerrada`);
      setCerradaId(r.id);
      recargar();
    } catch (e) {
      const bloqueo = e instanceof ApiError ? (e.detalles as BloqueoCierre | undefined) : undefined;
      if (bloqueo?.pagoEnRevision && !confirmarSaldo) {
        setEnviando(false);
        const ok = await confirmar({
          mensaje: `Mercado Pago todavía está revisando un pago de la mesa ${r.mesa.numero}. ¿Cerrarla igual?`,
          detalle:
            'Si Mercado Pago lo aprueba después, el pago se registra igual y queda para conciliar.',
          accion: 'Cerrar mesa',
        });
        if (ok) await enviarCierre(r, true);
        return;
      }
      const saldo = bloqueo?.saldoPendiente;
      if (saldo && !confirmarSaldo) {
        setEnviando(false);
        const ok = await confirmar({
          mensaje: `Queda ${formatoPesos(saldo)} sin pagar. ¿Cerrar la mesa ${r.mesa.numero} igual?`,
          detalle: 'La visita se registra solo si el cliente pagó.',
          accion: 'Cerrar mesa',
        });
        if (ok) await enviarCierre(r, true);
        return;
      }
      setError(e instanceof ApiError ? e.message : 'No se pudo cerrar la mesa');
      recargar();
    } finally {
      setEnviando(false);
    }
  }

  return {
    cerrar: (r: Pick<ReservaPanel, 'id' | 'mesa'>) => enviarCierre(r, false),
    enviando,
    error,
    cerradaId,
    limpiarError: (): void => setError(null),
  };
}
