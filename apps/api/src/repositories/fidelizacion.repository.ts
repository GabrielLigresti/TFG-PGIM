import type { GrupoPanel, ProgramaPanel, Referencia } from '@pgim/shared';
import type { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import type { DatosBeneficio } from '../domain/beneficio';

// Programa de puntos, grupos y beneficios de un restaurante (CU-17). Toda
// consulta va acotada por restaurante.

export interface FilaBeneficio extends DatosBeneficio {
  id: string;
  nombre: string;
  grupo: Referencia | null;
  menu: Referencia | null;
  pagosEnCurso: number;
}

export interface DatosNuevoBeneficio extends Omit<DatosBeneficio, 'stockDisponible' | 'activo'> {
  nombre: string;
  grupoId: string | null;
  menuId: string | null;
}

export interface EdicionNueva {
  vigenciaDesde: Date;
  vigenciaHasta: Date;
  stockDisponible: number | null;
}

export type ResultadoBorrarGrupo = 'BORRADO' | 'NO_EXISTE' | 'CON_BENEFICIOS';

export interface FidelizacionRepository {
  programa(restauranteId: string): Promise<ProgramaPanel | null>;
  // false si el restaurante ya tenía programa.
  crearPrograma(restauranteId: string, puntosPorUnidad: number): Promise<boolean>;
  grupos(restauranteId: string): Promise<GrupoPanel[]>;
  existeGrupo(restauranteId: string, id: string): Promise<boolean>;
  crearGrupo(restauranteId: string, nombre: string): Promise<GrupoPanel>;
  editarGrupo(restauranteId: string, id: string, nombre: string): Promise<GrupoPanel | null>;
  borrarGrupo(restauranteId: string, id: string): Promise<ResultadoBorrarGrupo>;
  existeMenu(restauranteId: string, id: string): Promise<boolean>;
  beneficios(
    restauranteId: string,
    filtros: { clase?: DatosBeneficio['clase']; grupoId?: string },
  ): Promise<FilaBeneficio[]>;
  beneficio(restauranteId: string, id: string): Promise<FilaBeneficio | null>;
  crearBeneficio(restauranteId: string, datos: DatosNuevoBeneficio): Promise<FilaBeneficio>;
  // Las tres operaciones reciben la regla del servicio como condición y la
  // vuelven a evaluar con el beneficio bloqueado: devuelven false si, mientras
  // tanto, dejó de cumplirse (por ejemplo, entró un pago que lo usa).
  editarBeneficio(
    restauranteId: string,
    id: string,
    datos: DatosNuevoBeneficio,
    puede: (b: FilaBeneficio) => boolean,
  ): Promise<boolean>;
  relanzarBeneficio(
    restauranteId: string,
    id: string,
    nueva: (b: FilaBeneficio) => EdicionNueva | null,
  ): Promise<boolean>;
  darDeBajaBeneficio(
    restauranteId: string,
    id: string,
    puede: (b: FilaBeneficio) => boolean,
  ): Promise<boolean>;
}

const seleccionBeneficio = {
  id: true,
  nombre: true,
  clase: true,
  criterioTipo: true,
  criterioValor: true,
  tipoDescuento: true,
  valor: true,
  vigenciaDesde: true,
  vigenciaHasta: true,
  stockInicial: true,
  stockDisponible: true,
  activo: true,
  grupo: { select: { id: true, nombre: true } },
  menu: { select: { id: true, nombre: true } },
  _count: { select: { aplicaciones: { where: { pago: { estado: 'PENDIENTE' } } } } },
} satisfies Prisma.BeneficioSelect;

type Fila = Prisma.BeneficioGetPayload<{ select: typeof seleccionBeneficio }>;

export function aFilaBeneficio({ _count, ...fila }: Fila): FilaBeneficio {
  return {
    ...fila,
    criterioValor: fila.criterioValor === null ? null : Number(fila.criterioValor),
    valor: Number(fila.valor),
    pagosEnCurso: _count.aplicaciones,
  };
}

function datosEscritura(datos: DatosNuevoBeneficio) {
  return {
    nombre: datos.nombre,
    clase: datos.clase,
    grupoId: datos.grupoId,
    menuId: datos.menuId,
    criterioTipo: datos.criterioTipo,
    criterioValor: datos.criterioValor,
    tipoDescuento: datos.tipoDescuento,
    valor: datos.valor,
    vigenciaDesde: datos.vigenciaDesde,
    vigenciaHasta: datos.vigenciaHasta,
    stockInicial: datos.stockInicial,
    stockDisponible: datos.stockInicial,
  };
}

// Bloquea el beneficio (un pago que lo usa no entra en el medio, porque
// también lo bloquea) y lo devuelve ya con los pagos en curso contados.
async function bloquear(
  tx: Prisma.TransactionClient,
  restauranteId: string,
  id: string,
): Promise<FilaBeneficio | null> {
  const filas = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM beneficio
    WHERE id = ${id}::uuid AND restaurante_id = ${restauranteId}::uuid
    FOR UPDATE`;
  if (filas.length === 0) return null;
  const fila = await tx.beneficio.findUniqueOrThrow({ where: { id }, select: seleccionBeneficio });
  return aFilaBeneficio(fila);
}

export const fidelizacionRepository: FidelizacionRepository = {
  async programa(restauranteId) {
    const fila = await prisma.programaFidelidad.findUnique({ where: { restauranteId } });
    return fila && { puntosPorUnidad: Number(fila.puntosPorUnidad) };
  },

  async crearPrograma(restauranteId, puntosPorUnidad) {
    const { count } = await prisma.programaFidelidad.createMany({
      data: [{ restauranteId, puntosPorUnidad }],
      skipDuplicates: true,
    });
    return count === 1;
  },

  async grupos(restauranteId) {
    const filas = await prisma.grupoBeneficios.findMany({
      where: { restauranteId },
      select: { id: true, nombre: true, _count: { select: { beneficios: true } } },
      orderBy: { nombre: 'asc' },
    });
    return filas.map((g) => ({
      id: g.id,
      nombre: g.nombre,
      cantidadBeneficios: g._count.beneficios,
    }));
  },

  async existeGrupo(restauranteId, id) {
    return (await prisma.grupoBeneficios.count({ where: { id, restauranteId } })) === 1;
  },

  async crearGrupo(restauranteId, nombre) {
    const g = await prisma.grupoBeneficios.create({ data: { restauranteId, nombre } });
    return { id: g.id, nombre: g.nombre, cantidadBeneficios: 0 };
  },

  async editarGrupo(restauranteId, id, nombre) {
    const { count } = await prisma.grupoBeneficios.updateMany({
      where: { id, restauranteId },
      data: { nombre },
    });
    if (count !== 1) return null;
    const cantidadBeneficios = await prisma.beneficio.count({ where: { grupoId: id } });
    return { id, nombre, cantidadBeneficios };
  },

  borrarGrupo(restauranteId, id) {
    return prisma.$transaction(async (tx): Promise<ResultadoBorrarGrupo> => {
      const grupo = await tx.grupoBeneficios.findFirst({
        where: { id, restauranteId },
        select: { _count: { select: { beneficios: true } } },
      });
      if (!grupo) return 'NO_EXISTE';
      if (grupo._count.beneficios > 0) return 'CON_BENEFICIOS';
      await tx.grupoBeneficios.delete({ where: { id } });
      return 'BORRADO';
    });
  },

  async existeMenu(restauranteId, id) {
    return (await prisma.menu.count({ where: { id, restauranteId } })) === 1;
  },

  async beneficios(restauranteId, filtros) {
    const filas = await prisma.beneficio.findMany({
      where: { restauranteId, ...filtros },
      select: seleccionBeneficio,
      orderBy: [{ vigenciaDesde: 'desc' }, { nombre: 'asc' }],
    });
    return filas.map(aFilaBeneficio);
  },

  async beneficio(restauranteId, id) {
    const fila = await prisma.beneficio.findFirst({
      where: { id, restauranteId },
      select: seleccionBeneficio,
    });
    return fila && aFilaBeneficio(fila);
  },

  async crearBeneficio(restauranteId, datos) {
    const fila = await prisma.beneficio.create({
      data: { restauranteId, ...datosEscritura(datos) },
      select: seleccionBeneficio,
    });
    return aFilaBeneficio(fila);
  },

  editarBeneficio(restauranteId, id, datos, puede) {
    return prisma.$transaction(async (tx) => {
      const actual = await bloquear(tx, restauranteId, id);
      if (!actual || !puede(actual)) return false;
      await tx.beneficio.update({ where: { id }, data: datosEscritura(datos) });
      return true;
    });
  },

  relanzarBeneficio(restauranteId, id, nueva) {
    return prisma.$transaction(async (tx) => {
      const actual = await bloquear(tx, restauranteId, id);
      const edicion = actual && nueva(actual);
      if (!edicion) return false;
      await tx.beneficio.update({ where: { id }, data: edicion });
      return true;
    });
  },

  darDeBajaBeneficio(restauranteId, id, puede) {
    return prisma.$transaction(async (tx) => {
      const actual = await bloquear(tx, restauranteId, id);
      if (!actual || !puede(actual)) return false;
      await tx.beneficio.update({ where: { id }, data: { activo: false } });
      return true;
    });
  },
};
