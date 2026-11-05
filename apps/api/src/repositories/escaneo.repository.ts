import type { EstadoEscaneo, InformeCalidad, ModeloRa, ModeloRaInput } from '@pgim/shared';
import type { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';

export interface FilaEscaneo {
  id: string;
  restauranteId: string;
  itemMenuId: string;
  empleadoId: string;
  estado: EstadoEscaneo;
  proveedor: string;
  tareaProveedorId: string | null;
  rutaVideo: string | null;
  urlModelo: string | null;
  urlModeloIos: string | null;
  calidad: InformeCalidad;
  error: string | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface CambioEscaneo {
  estado: EstadoEscaneo;
  tareaProveedorId?: string;
  rutaVideo?: null;
  urlModelo?: string;
  urlModeloIos?: string | null;
  error?: string;
}

export interface EscaneoRepository {
  crear(
    datos: Pick<
      FilaEscaneo,
      'restauranteId' | 'itemMenuId' | 'empleadoId' | 'proveedor' | 'rutaVideo' | 'calidad'
    >,
  ): Promise<FilaEscaneo>;
  ultimoDelPlato(restauranteId: string, itemMenuId: string): Promise<FilaEscaneo | null>;
  buscar(restauranteId: string, id: string): Promise<FilaEscaneo | null>;
  // Tarea de sistema: PENDIENTE y PROCESANDO de todos los restaurantes, por creadoEn.
  enCurso(): Promise<FilaEscaneo[]>;
  // updateMany con where { id, restauranteId, estado: desde }; true si cambió una fila.
  cambiarEstado(
    restauranteId: string,
    id: string,
    desde: EstadoEscaneo,
    cambio: CambioEscaneo,
  ): Promise<boolean>;
  // Transacción: EN_REVISION → PUBLICADO y upsert de MODELO_RA con urlModelo, urlModeloIos (null si
  // no tiene), escalaReal y porcionGramos. Devuelve el modelo anterior, o null si el escaneo ya no
  // estaba EN_REVISION.
  publicar(
    restauranteId: string,
    id: string,
    datos: ModeloRaInput,
  ): Promise<{ anterior: ModeloRa | null } | null>;
}

type FilaPrisma = Prisma.EscaneoPlatoGetPayload<object>;

function aFila(fila: FilaPrisma): FilaEscaneo {
  return { ...fila, calidad: fila.calidad as unknown as InformeCalidad };
}

export const escaneoRepository: EscaneoRepository = {
  async crear(datos) {
    const fila = await prisma.escaneoPlato.create({
      data: { ...datos, calidad: datos.calidad as unknown as Prisma.InputJsonValue },
    });
    return aFila(fila);
  },

  async ultimoDelPlato(restauranteId, itemMenuId) {
    const fila = await prisma.escaneoPlato.findFirst({
      where: { restauranteId, itemMenuId },
      orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
    });
    return fila && aFila(fila);
  },

  async buscar(restauranteId, id) {
    const fila = await prisma.escaneoPlato.findFirst({ where: { id, restauranteId } });
    return fila && aFila(fila);
  },

  // Sin filtro de restaurante: es la tarea de sistema, que procesa los de todos.
  async enCurso() {
    const filas = await prisma.escaneoPlato.findMany({
      where: { estado: { in: ['PENDIENTE', 'PROCESANDO'] } },
      orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }],
    });
    return filas.map(aFila);
  },

  async cambiarEstado(restauranteId, id, desde, cambio) {
    const { count } = await prisma.escaneoPlato.updateMany({
      where: { id, restauranteId, estado: desde },
      data: cambio,
    });
    return count === 1;
  },

  async publicar(restauranteId, id, datos) {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.escaneoPlato.updateMany({
        where: { id, restauranteId, estado: 'EN_REVISION' },
        data: { estado: 'PUBLICADO' },
      });
      if (count !== 1) return null;
      const escaneo = await tx.escaneoPlato.findFirstOrThrow({ where: { id, restauranteId } });
      const anterior = await tx.modeloRA.findFirst({
        where: { itemMenuId: escaneo.itemMenuId, itemMenu: { restauranteId } },
      });
      const modelo = {
        urlModelo: escaneo.urlModelo!,
        urlModeloIos: escaneo.urlModeloIos,
        escalaReal: datos.escalaReal,
        porcionGramos: datos.porcionGramos,
      };
      await tx.modeloRA.upsert({
        where: { itemMenuId: escaneo.itemMenuId },
        create: { itemMenuId: escaneo.itemMenuId, ...modelo },
        update: modelo,
      });
      return {
        anterior: anterior && {
          urlModelo: anterior.urlModelo,
          urlModeloIos: anterior.urlModeloIos,
          escalaReal: Number(anterior.escalaReal),
          porcionGramos: anterior.porcionGramos,
        },
      };
    });
  },
};
