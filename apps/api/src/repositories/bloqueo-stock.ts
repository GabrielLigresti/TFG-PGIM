import type { Prisma } from '../generated/prisma/client';

// Todo lo que mueve las existencias de una sucursal (confirmar y cancelar
// pedidos, movimientos manuales, tandas) toma este bloqueo y va de a uno.
// La clave es la misma que usaba el pedido, para que se excluyan entre sí.
export async function bloquearStockDeSucursal(
  tx: Prisma.TransactionClient,
  sucursalId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${`pedido|${sucursalId}`}::text))) AS bloqueo`;
}
