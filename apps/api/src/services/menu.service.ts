import type { CategoriaInput, MenuInput, ModeloRaInput, PlatoInput } from '@pgim/shared';
import * as archivosFoto from '../lib/archivos-foto';
import * as archivosModelo from '../lib/archivos-modelo';
import type { FormatoModelo } from '../lib/archivos-modelo';
import { AppError } from '../lib/errors';
import { menuRepository, type MenuRepository } from '../repositories/menu.repository';

export type ArchivosModelo = Pick<
  typeof archivosModelo,
  'validarGlb' | 'validarUsdz' | 'guardarModelo' | 'borrarModelo'
>;

export type ArchivosFoto = Pick<typeof archivosFoto, 'validarFoto' | 'guardarFoto' | 'borrarFoto'>;

export function createMenuService(
  repo: MenuRepository,
  archivos: ArchivosModelo = archivosModelo,
  fotos: ArchivosFoto = archivosFoto,
) {
  async function obtenerCategoria(restauranteId: string, id: string) {
    const categoria = await repo.buscarCategoria(restauranteId, id);
    if (!categoria) throw new AppError(404, 'La categoría no existe');
    return categoria;
  }

  async function verificarNombreCategoria(
    restauranteId: string,
    nombre: string,
    excluirId?: string,
  ) {
    if (await repo.existeCategoria(restauranteId, nombre, excluirId)) {
      throw new AppError(409, `Ya existe una categoría llamada "${nombre}"`);
    }
  }

  async function obtenerPlato(restauranteId: string, id: string) {
    const plato = await repo.buscarPlato(restauranteId, id);
    if (!plato) throw new AppError(404, 'El plato no existe');
    return plato;
  }

  async function verificarPlato(restauranteId: string, datos: PlatoInput, excluirId?: string) {
    await obtenerCategoria(restauranteId, datos.categoriaId);
    if (await repo.existePlato(restauranteId, datos.nombre, excluirId)) {
      throw new AppError(409, `Ya existe un plato llamado "${datos.nombre}"`);
    }
    if (datos.insumoReventaId) await verificarReventa(restauranteId, datos.insumoReventaId);
  }

  // Se revende tal cual: un insumo activo del restaurante que se cuenta por
  // unidades (cada porción descuenta 1).
  async function verificarReventa(restauranteId: string, insumoId: string) {
    const insumo = await repo.buscarInsumoReventa(restauranteId, insumoId);
    if (!insumo || insumo.tipo !== 'INSUMO') {
      throw new AppError(400, 'Elegí un insumo del restaurante para vender como viene');
    }
    if (!insumo.activo) throw new AppError(400, `${insumo.nombre} está dado de baja`);
    if (insumo.unidadBase !== 'UNIDAD') {
      throw new AppError(
        400,
        `${insumo.nombre} no se cuenta por unidades: no se puede vender como viene`,
      );
    }
  }

  async function obtenerMenu(restauranteId: string, id: string) {
    const menu = await repo.buscarMenu(restauranteId, id);
    if (!menu) throw new AppError(404, 'El menú no existe');
    return menu;
  }

  // Sin platos repetidos y todos del restaurante y activos.
  async function normalizarMenu(restauranteId: string, datos: MenuInput, excluirId?: string) {
    if (await repo.existeMenu(restauranteId, datos.nombre, excluirId)) {
      throw new AppError(409, `Ya existe un menú llamado "${datos.nombre}"`);
    }
    const platoIds = [...new Set(datos.platoIds)];
    if ((await repo.contarPlatosActivos(restauranteId, platoIds)) !== platoIds.length) {
      throw new AppError(400, 'El menú solo puede tener platos activos del restaurante');
    }
    return { ...datos, platoIds };
  }

  return {
    listarCategorias: (restauranteId: string) => repo.listarCategorias(restauranteId),

    async crearCategoria(restauranteId: string, datos: CategoriaInput) {
      await verificarNombreCategoria(restauranteId, datos.nombre);
      return repo.crearCategoria(restauranteId, datos);
    },

    async actualizarCategoria(restauranteId: string, id: string, datos: CategoriaInput) {
      await obtenerCategoria(restauranteId, id);
      await verificarNombreCategoria(restauranteId, datos.nombre, id);
      return repo.actualizarCategoria(restauranteId, id, datos);
    },

    // La tabla no tiene baja lógica: se borra solo si no tiene platos.
    async borrarCategoria(restauranteId: string, id: string) {
      const categoria = await obtenerCategoria(restauranteId, id);
      if (categoria.cantidadPlatos > 0) {
        throw new AppError(
          409,
          `La categoría "${categoria.nombre}" tiene ${categoria.cantidadPlatos} plato(s): movelos a otra categoría antes de borrarla`,
        );
      }
      await repo.borrarCategoria(restauranteId, id);
    },

    listarPlatos: (restauranteId: string) => repo.listarPlatos(restauranteId),

    async crearPlato(restauranteId: string, datos: PlatoInput) {
      await verificarPlato(restauranteId, datos);
      return repo.crearPlato(restauranteId, datos);
    },

    async actualizarPlato(restauranteId: string, id: string, datos: PlatoInput) {
      const plato = await obtenerPlato(restauranteId, id);
      // Un plato tiene receta o se vende como viene, nunca las dos cosas.
      if (datos.insumoReventaId && plato.tieneReceta) {
        throw new AppError(
          409,
          `${plato.nombre} tiene receta: borrala antes de venderlo como viene`,
        );
      }
      await verificarPlato(restauranteId, datos, id);
      return repo.actualizarPlato(restauranteId, id, datos);
    },

    async desactivarPlato(restauranteId: string, id: string) {
      await obtenerPlato(restauranteId, id);
      await repo.desactivarPlato(restauranteId, id);
    },

    // Foto desde la computadora: reemplaza la URL y borra la subida anterior.
    async subirFoto(restauranteId: string, id: string, archivo: Buffer) {
      const plato = await obtenerPlato(restauranteId, id);
      const url = await fotos.guardarFoto(archivo, fotos.validarFoto(archivo));
      try {
        await repo.guardarFotoPlato(restauranteId, id, url);
      } catch (e) {
        await fotos.borrarFoto(url);
        throw e;
      }
      await fotos.borrarFoto(plato.fotoUrl);
      return obtenerPlato(restauranteId, id);
    },

    // CU-16: el .glb es obligatorio y trae la escala y la porción; el .usdz
    // (iOS) es opcional y solo se suma a un modelo existente. El archivo nuevo
    // se guarda antes que la fila y el viejo se borra al final.
    async subirModelo(
      restauranteId: string,
      id: string,
      formato: FormatoModelo,
      archivo: Buffer,
      datos?: ModeloRaInput,
    ) {
      const plato = await obtenerPlato(restauranteId, id);
      const actual = plato.modeloRa;
      if (formato === 'glb') archivos.validarGlb(archivo);
      else archivos.validarUsdz(archivo);
      if (formato === 'usdz' && !actual) {
        throw new AppError(409, 'Primero subí el modelo .glb del plato');
      }
      if (formato === 'glb' && !datos) {
        throw new AppError(400, 'Indicá la escala y la porción del modelo');
      }

      const url = await archivos.guardarModelo(archivo, formato);
      const nuevo =
        formato === 'glb'
          ? { urlModelo: url, urlModeloIos: actual?.urlModeloIos ?? null, ...datos! }
          : { ...actual!, urlModeloIos: url };
      try {
        await repo.guardarModeloRa(restauranteId, id, nuevo);
      } catch (e) {
        await archivos.borrarModelo(url);
        throw e;
      }
      await archivos.borrarModelo(formato === 'glb' ? actual?.urlModelo : actual?.urlModeloIos);
      return obtenerPlato(restauranteId, id);
    },

    async actualizarDatosModelo(restauranteId: string, id: string, datos: ModeloRaInput) {
      const { modeloRa } = await obtenerPlato(restauranteId, id);
      if (!modeloRa) throw new AppError(409, 'El plato no tiene modelo RA');
      await repo.guardarModeloRa(restauranteId, id, { ...modeloRa, ...datos });
      return obtenerPlato(restauranteId, id);
    },

    async quitarModelo(restauranteId: string, id: string) {
      const { modeloRa } = await obtenerPlato(restauranteId, id);
      if (!modeloRa) return;
      await repo.borrarModeloRa(restauranteId, id);
      await archivos.borrarModelo(modeloRa.urlModelo);
      await archivos.borrarModelo(modeloRa.urlModeloIos);
    },

    listarMenus: (restauranteId: string) => repo.listarMenus(restauranteId),

    async crearMenu(restauranteId: string, datos: MenuInput) {
      return repo.crearMenu(restauranteId, await normalizarMenu(restauranteId, datos));
    },

    async actualizarMenu(restauranteId: string, id: string, datos: MenuInput) {
      await obtenerMenu(restauranteId, id);
      return repo.actualizarMenu(restauranteId, id, await normalizarMenu(restauranteId, datos, id));
    },

    // La tabla no tiene baja lógica: se borra solo si nada lo usa.
    async borrarMenu(restauranteId: string, id: string) {
      const menu = await obtenerMenu(restauranteId, id);
      if (menu.sucursalesActivas.length > 0) {
        const sucursales = menu.sucursalesActivas.map((s) => s.nombre).join(', ');
        throw new AppError(
          409,
          `El menú "${menu.nombre}" está activo en ${sucursales}: elegí otro menú para esas sucursales antes de borrarlo`,
        );
      }
      if ((await repo.contarPromociones(restauranteId, id)) > 0) {
        throw new AppError(409, `El menú "${menu.nombre}" tiene promociones asociadas`);
      }
      await repo.borrarMenu(restauranteId, id);
    },
  };
}

export const menuService = createMenuService(menuRepository);
