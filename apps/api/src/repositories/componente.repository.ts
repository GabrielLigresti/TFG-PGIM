import { prisma } from '../lib/prisma';

// Nombres de los platos e intermedios cuyas recetas usan un componente. Sirve
// para bloquear la baja de insumos e intermedios que siguen en uso.
export async function usosDeComponente(
  restauranteId: string,
  componenteId: string,
): Promise<string[]> {
  const lineas = await prisma.lineaReceta.findMany({
    where: { componenteId, componente: { restauranteId } },
    select: {
      receta: {
        select: {
          itemMenu: { select: { nombre: true } },
          productoIntermedio: { select: { nombre: true } },
        },
      },
    },
  });
  return lineas
    .map(({ receta }) => receta.itemMenu?.nombre ?? receta.productoIntermedio?.nombre ?? '')
    .sort((a, b) => a.localeCompare(b, 'es'));
}

// El nombre de un componente (insumo o intermedio) es único en el restaurante.
export async function existeNombreComponente(
  restauranteId: string,
  nombre: string,
  excluirId?: string,
): Promise<boolean> {
  const cantidad = await prisma.componenteInventario.count({
    where: {
      restauranteId,
      nombre: { equals: nombre, mode: 'insensitive' },
      ...(excluirId && { id: { not: excluirId } }),
    },
  });
  return cantidad > 0;
}
