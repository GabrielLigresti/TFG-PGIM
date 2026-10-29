import type { MiMesa } from '@pgim/shared';
import { pasarela as pasarelaPorDefecto, type PasarelaPago } from '../pagos/pasarela';
import {
  cuentaMesaRepository,
  type CuentaMesaRepository,
  type FilaMesa,
} from '../repositories/cuenta-mesa.repository';
import { pagoService } from './pago.service';

const centavos = (valor: number) => Math.round(valor * 100) / 100;

// "Mi mesa" del comensal: pedidos, saldo y el pago en curso, si hay uno. El
// pago en sí está en pago.service.
export function createCuentaMesaService(
  repo: CuentaMesaRepository,
  pasarela: Pick<PasarelaPago, 'habilitada'>,
  urlDePago: (pagoId: string) => string | null,
) {
  function aMiMesa(fila: FilaMesa): MiMesa {
    const total = centavos(
      fila.pedidos.filter((p) => p.estado !== 'CANCELADO').reduce((t, p) => t + p.total, 0),
    );
    return {
      cuentaMesaId: fila.cuentaMesaId,
      sucursal: fila.sucursal,
      mesa: { numero: fila.mesaNumero },
      abiertaEn: fila.abiertaEn.toISOString(),
      pedidos: fila.pedidos,
      total,
      pagado: fila.pagado,
      descuentos: fila.descuentos,
      saldo: centavos(total - fila.pagado - fila.descuentos),
      pagoHabilitado: pasarela.habilitada,
      pagoEnCurso: fila.pagoPendienteId
        ? { pagoId: fila.pagoPendienteId, urlPago: urlDePago(fila.pagoPendienteId) }
        : null,
    };
  }

  return {
    async miMesa(comensalId: string, sucursalId?: string): Promise<MiMesa | null> {
      const fila = await repo.mesaAbiertaDelComensal(comensalId, sucursalId);
      return fila && aMiMesa(fila);
    },
  };
}

export const cuentaMesaService = createCuentaMesaService(
  cuentaMesaRepository,
  pasarelaPorDefecto,
  (pagoId) => pagoService.urlDePago(pagoId),
);
