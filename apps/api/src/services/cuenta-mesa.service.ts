import type { MiMesa } from '@pgim/shared';
import { busEventos, type BusEventos } from '../domain/eventos';
import { AppError } from '../lib/errors';
import { pasarela as pasarelaPorDefecto, type PasarelaPago } from '../pagos/pasarela';
import {
  cuentaMesaRepository,
  type CuentaMesaRepository,
  type FilaMesa,
} from '../repositories/cuenta-mesa.repository';

const centavos = (valor: number) => Math.round(valor * 100) / 100;

// "Mi mesa" del comensal y el pago de la cuenta (pago simulado en el Hito 4).
export function createCuentaMesaService(
  repo: CuentaMesaRepository,
  pasarela: PasarelaPago,
  bus: BusEventos,
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
      saldo: centavos(total - fila.pagado),
      pagoHabilitado: pasarela.habilitada,
    };
  }

  async function mesaDelComensal(comensalId: string, cuentaMesaId: string) {
    const fila = await repo.buscarDelComensal(comensalId, cuentaMesaId);
    if (!fila) throw new AppError(404, 'La mesa no existe');
    return fila;
  }

  return {
    async miMesa(comensalId: string, sucursalId?: string): Promise<MiMesa | null> {
      const fila = await repo.mesaAbiertaDelComensal(comensalId, sucursalId);
      return fila && aMiMesa(fila);
    },

    // Siempre por el saldo completo; se puede seguir pidiendo después.
    async pagar(comensalId: string, cuentaMesaId: string): Promise<MiMesa> {
      const fila = await mesaDelComensal(comensalId, cuentaMesaId);
      if (fila.estado !== 'ABIERTA') throw new AppError(409, 'La mesa ya está cerrada');
      const { saldo } = aMiMesa(fila);
      if (saldo <= 0) throw new AppError(409, 'La mesa no tiene saldo para pagar');
      if (!pasarela.habilitada) throw new AppError(503, 'El pago de prueba no está habilitado');

      // El repositorio vuelve a controlar estado y saldo con la cuenta bloqueada.
      const estado = await repo.registrarPago(cuentaMesaId, comensalId, async (pago) => {
        const inicio = await pasarela.iniciarCobro({
          ...pago,
          metodo: 'TARJETA',
          descripcion: `Mesa ${fila.mesaNumero}`,
        });
        return inicio.tipo === 'APROBADO_AL_INSTANTE'
          ? { estado: 'APROBADO', referenciaExterna: inicio.referenciaExterna }
          : { estado: 'RECHAZADO' };
      });
      if (estado === 'CERRADA') throw new AppError(409, 'La mesa ya está cerrada');
      if (estado === 'SIN_SALDO') throw new AppError(409, 'La mesa no tiene saldo para pagar');
      if (estado !== 'APROBADO') throw new AppError(402, 'No se pudo hacer el pago');
      bus.publicar({ tipo: 'PAGO_APROBADO', cuentaMesaId, comensalId });
      return aMiMesa(await mesaDelComensal(comensalId, cuentaMesaId));
    },
  };
}

export const cuentaMesaService = createCuentaMesaService(
  cuentaMesaRepository,
  pasarelaPorDefecto,
  busEventos,
);
