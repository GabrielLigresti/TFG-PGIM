import { ROLES_PREDETERMINADOS, type RolPredeterminado } from '@pgim/shared';
import type { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';

// Crea o actualiza un rol del restaurante y reemplaza sus permisos. Es
// idempotente: sirve para el alta del restaurante (CU-11) y para el seed.
// `codigoAId` mapea el código de cada permiso del catálogo a su id.
export async function upsertRol(
  tx: Prisma.TransactionClient,
  restauranteId: string,
  rol: RolPredeterminado,
  predeterminado: boolean,
  codigoAId: Map<string, string>,
): Promise<string> {
  const { id } = await tx.rol.upsert({
    where: { restauranteId_nombre: { restauranteId, nombre: rol.nombre } },
    update: { arquetipo: rol.arquetipo, predeterminado, activo: true },
    create: { restauranteId, nombre: rol.nombre, arquetipo: rol.arquetipo, predeterminado },
  });

  await tx.rolPermiso.deleteMany({ where: { rolId: id } });
  await tx.rolPermiso.createMany({
    data: rol.permisos.map((codigo) => ({ rolId: id, permisoId: codigoAId.get(codigo)! })),
  });
  return id;
}

// Crea los roles predeterminados (Administrador y demás) de un restaurante y
// devuelve sus ids por nombre. Los permisos son globales y vienen del catálogo
// que carga el seed; si falta alguno, el catálogo está incompleto.
export async function crearRolesPredeterminados(
  tx: Prisma.TransactionClient,
  restauranteId: string,
): Promise<Map<string, string>> {
  const necesarios = [...new Set(ROLES_PREDETERMINADOS.flatMap((r) => r.permisos))];
  const filas = await tx.permiso.findMany({
    where: { codigo: { in: necesarios } },
    select: { id: true, codigo: true },
  });
  const codigoAId = new Map(filas.map((p) => [p.codigo, p.id]));

  const faltan = necesarios.filter((codigo) => !codigoAId.has(codigo));
  if (faltan.length > 0) {
    throw new AppError(500, 'El catálogo de permisos no está cargado', { faltan });
  }

  const ids = new Map<string, string>();
  for (const rol of ROLES_PREDETERMINADOS) {
    ids.set(rol.nombre, await upsertRol(tx, restauranteId, rol, true, codigoAId));
  }
  return ids;
}
