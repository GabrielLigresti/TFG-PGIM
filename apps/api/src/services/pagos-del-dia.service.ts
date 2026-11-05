import { hoyArgentina, type PagosDelDia } from '@pgim/shared';
import { resumirPagosDelDia } from '../domain/pagos-del-dia';
import {
  pagosDelDiaRepository,
  type PagosDelDiaRepository,
} from '../repositories/pagos-del-dia.repository';

// Pagos del día de la sucursal (CU-23): solo lectura.
export function createPagosDelDiaService(repo: PagosDelDiaRepository) {
  return {
    async delDia(restauranteId: string, sucursalId: string, ahora: Date): Promise<PagosDelDia> {
      const fecha = hoyArgentina(ahora);
      const pagos = await repo.delDia(restauranteId, sucursalId, fecha);
      return { fecha, totales: resumirPagosDelDia(pagos), pagos };
    },
  };
}

export const pagosDelDiaService = createPagosDelDiaService(pagosDelDiaRepository);
