import {
  CRITERIOS,
  type Escaneo,
  type InformeCalidad,
  type ModeloRaInput,
  type UmbralesCalidad,
} from '@pgim/shared';
import { env } from '../config/env';
import { estadoDeEscaneo, ESTADOS_ESCANEO_ACTIVOS } from '../domain/escaneo';
import type { Proveedor3D, ResultadoEscaneo } from '../escaneo/proveedor-3d';
import { registroProveedores, type RegistroProveedores } from '../escaneo/registro';
import * as archivosModelo from '../lib/archivos-modelo';
import * as archivosVideo from '../lib/archivos-video';
import { AppError, esClaveDuplicada } from '../lib/errors';
import { formatoVideo, leerMetadatosMp4 } from '../lib/mp4';
import {
  escaneoRepository,
  type EscaneoRepository,
  type FilaEscaneo,
} from '../repositories/escaneo.repository';
import { menuRepository, type MenuRepository } from '../repositories/menu.repository';

export interface DependenciasEscaneo {
  menu: Pick<MenuRepository, 'buscarPlato'>;
  videos: Pick<typeof archivosVideo, 'guardarVideo' | 'leerVideo' | 'borrarVideo'>;
  modelos: Pick<
    typeof archivosModelo,
    'validarGlb' | 'validarUsdz' | 'guardarModelo' | 'borrarModelo'
  >;
  proveedores: RegistroProveedores;
  ahora: () => Date;
  timeoutMin: number;
}

// Diferencia tolerada entre el informe del navegador y el MP4 que llegó.
const TOLERANCIA_DURACION_S = 1;
const TOLERANCIA_PX = 2;

const ESCANEO_EN_CURSO = 'Este plato ya tiene un escaneo en curso';

export function aEscaneo(fila: FilaEscaneo): Escaneo {
  return {
    id: fila.id,
    platoId: fila.itemMenuId,
    estado: fila.estado,
    urlModelo: fila.urlModelo,
    urlModeloIos: fila.urlModeloIos,
    error: fila.error,
    creadoEn: fila.creadoEn.toISOString(),
    actualizadoEn: fila.actualizadoEn.toISOString(),
  };
}

export function createEscaneoService(repo: EscaneoRepository, deps: DependenciasEscaneo) {
  async function obtener(restauranteId: string, id: string) {
    const fila = await repo.buscar(restauranteId, id);
    if (!fila) throw new AppError(404, 'El escaneo no existe');
    return fila;
  }

  // Un borrado que falla no revierte lo ya confirmado: queda un archivo huérfano.
  async function borrarArchivo(url: string | null | undefined) {
    if (!url) return;
    try {
      await deps.modelos.borrarModelo(url);
    } catch (e) {
      console.error('No se pudo borrar el modelo del escaneo', url, e);
    }
  }

  function verificarInforme(informe: InformeCalidad, real: ReturnType<typeof leerMetadatosMp4>) {
    const m = informe.metadatos;
    // Lado menor y mayor: el navegador informa la orientación ya rotada y el tkhd no.
    const difiere =
      Math.abs(m.duracionS - real.duracionS) > TOLERANCIA_DURACION_S ||
      Math.abs(Math.min(m.ancho, m.alto) - Math.min(real.ancho, real.alto)) > TOLERANCIA_PX ||
      Math.abs(Math.max(m.ancho, m.alto) - Math.max(real.ancho, real.alto)) > TOLERANCIA_PX;
    if (difiere) throw new AppError(422, 'El informe de calidad no corresponde a este video');
  }

  // Un borrado que falla no revierte el cambio de estado: queda un video huérfano.
  async function borrarVideo(ruta: string | null) {
    if (!ruta) return;
    try {
      await deps.videos.borrarVideo(ruta);
    } catch (e) {
      console.error('No se pudo borrar el video del escaneo', ruta, e);
    }
  }

  // Pasa a FALLIDO con el motivo; el video ya no hace falta y se descarta con la fila.
  async function fallar(fila: FilaEscaneo, motivo: string) {
    const estado = estadoDeEscaneo(fila.estado).fallar();
    const cambio = await repo.cambiarEstado(fila.restauranteId, fila.id, fila.estado, {
      estado,
      error: motivo,
      rutaVideo: null,
    });
    if (cambio) await borrarVideo(fila.rutaVideo);
  }

  async function enviar(fila: FilaEscaneo, proveedor: Proveedor3D) {
    let tareaProveedorId: string;
    try {
      if (!fila.rutaVideo) throw new Error('El escaneo no tiene video');
      const video = await deps.videos.leerVideo(fila.rutaVideo);
      const formato = fila.rutaVideo.toLowerCase().endsWith('.mov') ? 'mov' : 'mp4';
      tareaProveedorId = await proveedor.iniciar(video, formato);
    } catch (e) {
      console.error('No se pudo enviar el video del escaneo', fila.id, e);
      return fallar(fila, 'No pudimos enviar el video');
    }
    const estado = estadoDeEscaneo(fila.estado).enviar();
    await repo.cambiarEstado(fila.restauranteId, fila.id, fila.estado, {
      estado,
      tareaProveedorId,
    });
  }

  async function completar(
    fila: FilaEscaneo,
    resultado: Extract<ResultadoEscaneo, { estado: 'LISTO' }>,
  ) {
    try {
      deps.modelos.validarGlb(resultado.glb);
      if (resultado.usdz) deps.modelos.validarUsdz(resultado.usdz);
    } catch (e) {
      if (e instanceof AppError) return fallar(fila, e.message);
      throw e;
    }
    const estado = estadoDeEscaneo(fila.estado).completar();
    const guardados: string[] = [];
    let cambio = false;
    try {
      const urlModelo = await deps.modelos.guardarModelo(resultado.glb, 'glb');
      guardados.push(urlModelo);
      const urlModeloIos = resultado.usdz
        ? await deps.modelos.guardarModelo(resultado.usdz, 'usdz')
        : null;
      if (urlModeloIos) guardados.push(urlModeloIos);
      cambio = await repo.cambiarEstado(fila.restauranteId, fila.id, fila.estado, {
        estado,
        urlModelo,
        urlModeloIos,
        rutaVideo: null,
      });
    } finally {
      // Si algo falló o el escaneo ya cambió de estado, los archivos no los usa nadie.
      if (!cambio) for (const url of guardados) await borrarArchivo(url);
    }
    if (cambio) await borrarVideo(fila.rutaVideo);
  }

  async function consultar(fila: FilaEscaneo, proveedor: Proveedor3D) {
    if (!fila.tareaProveedorId) return fallar(fila, 'No pudimos recuperar el escaneo');
    const resultado = await proveedor.consultar(fila.tareaProveedorId);
    if (resultado.estado === 'LISTO') return completar(fila, resultado);
    if (resultado.estado === 'FALLIDO') return fallar(fila, resultado.motivo);
    // actualizadoEn es el momento del envío: nada más toca la fila mientras procesa.
    const transcurridoMs = deps.ahora().getTime() - fila.actualizadoEn.getTime();
    if (transcurridoMs > deps.timeoutMin * 60_000)
      return fallar(fila, 'El escaneo tardó demasiado');
  }

  async function procesar(fila: FilaEscaneo) {
    const proveedor = deps.proveedores.buscar(fila.proveedor);
    if (fila.estado === 'PENDIENTE') return enviar(fila, proveedor);
    if (fila.estado === 'PROCESANDO') return consultar(fila, proveedor);
  }

  return {
    requisitos(): UmbralesCalidad {
      return deps.proveedores.activo().requisitos();
    },

    async crear(
      restauranteId: string,
      platoId: string,
      empleadoId: string,
      video: Buffer,
      informe: InformeCalidad,
    ): Promise<Escaneo> {
      if (!(await deps.menu.buscarPlato(restauranteId, platoId))) {
        throw new AppError(404, 'El plato no existe');
      }
      const real = leerMetadatosMp4(video);
      if (informe.nivelGlobal === 'RECHAZO') {
        throw new AppError(422, 'El video no pasó la revisión de calidad');
      }
      const proveedor = deps.proveedores.activo();
      const formato = CRITERIOS.find((c) => c.id === 'FORMATO')!.evaluar(
        [],
        real,
        proveedor.requisitos(),
      );
      if (formato.nivel === 'RECHAZO') {
        throw new AppError(422, formato.mensaje ?? 'El video no cumple el formato requerido');
      }
      verificarInforme(informe, real);

      const ultimo = await repo.ultimoDelPlato(restauranteId, platoId);
      if (ultimo && ESTADOS_ESCANEO_ACTIVOS.includes(ultimo.estado)) {
        throw new AppError(409, ESCANEO_EN_CURSO);
      }

      const rutaVideo = await deps.videos.guardarVideo(video, formatoVideo(video));
      try {
        const fila = await repo.crear({
          restauranteId,
          itemMenuId: platoId,
          empleadoId,
          proveedor: proveedor.nombre,
          rutaVideo,
          calidad: informe,
        });
        return aEscaneo(fila);
      } catch (e) {
        // Dos altas simultáneas: el índice único deja pasar una sola.
        await deps.videos.borrarVideo(rutaVideo);
        if (esClaveDuplicada(e)) throw new AppError(409, ESCANEO_EN_CURSO);
        throw e;
      }
    },

    async ultimo(restauranteId: string, platoId: string): Promise<Escaneo | null> {
      const fila = await repo.ultimoDelPlato(restauranteId, platoId);
      return fila && aEscaneo(fila);
    },

    async publicar(restauranteId: string, id: string, datos: ModeloRaInput): Promise<Escaneo> {
      const fila = await obtener(restauranteId, id);
      estadoDeEscaneo(fila.estado).publicar();
      const resultado = await repo.publicar(restauranteId, id, datos);
      if (!resultado) throw new AppError(409, 'El escaneo ya está publicado o descartado');
      // Después del commit: el modelo anterior (y su .usdz) ya no lo usa nadie.
      await borrarArchivo(resultado.anterior?.urlModelo);
      await borrarArchivo(resultado.anterior?.urlModeloIos);
      return aEscaneo(await obtener(restauranteId, id));
    },

    async descartar(restauranteId: string, id: string): Promise<Escaneo> {
      const fila = await obtener(restauranteId, id);
      const siguiente = estadoDeEscaneo(fila.estado).descartar();
      const cambio = await repo.cambiarEstado(restauranteId, id, fila.estado, {
        estado: siguiente,
      });
      if (!cambio) throw new AppError(409, 'El escaneo ya está publicado o descartado');
      await borrarArchivo(fila.urlModelo);
      await borrarArchivo(fila.urlModeloIos);
      return aEscaneo(await obtener(restauranteId, id));
    },

    // Tarea de sistema: avanza los escaneos PENDIENTE y PROCESANDO de todos los restaurantes.
    async procesarEnCurso(): Promise<void> {
      for (const fila of await repo.enCurso()) {
        try {
          await procesar(fila);
        } catch (e) {
          console.error('No se pudo procesar el escaneo', fila.id, e);
        }
      }
    },
  };
}

export const escaneoService = createEscaneoService(escaneoRepository, {
  menu: menuRepository,
  videos: archivosVideo,
  modelos: archivosModelo,
  proveedores: registroProveedores,
  ahora: () => new Date(),
  timeoutMin: env.ESCANEO_TIMEOUT_MIN,
});
