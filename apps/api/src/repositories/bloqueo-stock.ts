import type { Prisma } from '../generated/prisma/client';

// Lock advisory de transacción por sucursal. Cada clase de operación usa su
// propio prefijo, así solo se excluyen entre sí las que comparten prefijo.
export async function bloquearSucursal(
  tx: Prisma.TransactionClient,
  prefijo: string,
  sucursalId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${`${prefijo}|${sucursalId}`}::text))) AS bloqueo`;
}

// Todo lo que mueve las existencias de una sucursal (confirmar y cancelar
// pedidos, movimientos manuales, tandas) toma este bloqueo y va de a uno.
// La clave es la misma que usaba el pedido, para que se excluyan entre sí.
export function bloquearStockDeSucursal(
  tx: Prisma.TransactionClient,
  sucursalId: string,
): Promise<void> {
  return bloquearSucursal(tx, 'pedido', sucursalId);
}
