import { randomUUID } from 'node:crypto';
import type {
  CodigoPermiso,
  ComponenteReceta,
  IntermedioAlta,
  RecetaDetalle,
  RecetaInput,
  ResumenRecetas,
} from '@pgim/shared';
import {
  RecetaBuilder,
  RecetaInvalidaError,
  cantidadBruta,
  costoLinea,
  costoTotal,
  costoUnitario,
  type Componente,
  type Receta,
} from '../domain/receta';
import { AppError } from '../lib/errors';
import {
  armarReceta,
  recetaRepository,
  type Catalogo,
  type RecetaRepository,
} from '../repositories/receta.repository';

function detalle(dueno: RecetaDetalle['dueno'], receta: Receta | null): RecetaDetalle {
  if (!receta) return { dueno, receta: null };
  const total = costoTotal(receta);
  return {
    dueno,
    receta: {
      rendimiento: receta.rendimiento,
      instrucciones: receta.instrucciones,
      lineas: receta.lineas.map((l) => ({
        componenteId: l.componente.id,
        componente: l.componente.nombre,
        tipo: l.componente.tipo,
        cantidad: l.cantidad,
        unidad: l.unidad,
        porcentajeMerma: l.porcentajeMerma,
        cantidadBruta: cantidadBruta(l),
        costo: costoLinea(l),
      })),
      costoTotal: total,
      costoPorPorcion: total / receta.rendimiento,
    },
  };
}

// Pasa la receta del formulario por el RecetaBuilder (CU-07).
function construir(builder: RecetaBuilder, datos: RecetaInput, catalogo: Catalogo): Receta {
  for (const linea of datos.lineas) {
    const componente = catalogo.get(linea.componenteId);
    if (!componente) throw new AppError(404, 'Algún componente de la receta no existe');
    builder.agregarLinea(componente, linea.cantidad, linea.unidad, linea.porcentajeMerma);
  }
  try {
    return builder.conRendimiento(datos.rendimiento).conInstrucciones(datos.instrucciones).build();
  } catch (e) {
    if (e instanceof RecetaInvalidaError) {
      throw new AppError(400, 'La receta tiene errores', e.errores);
    }
    throw e;
  }
}

// Crear la primera receta pide receta.crear; reemplazar una existente, receta.editar.
function verificarPermiso(permisos: readonly CodigoPermiso[], existe: boolean) {
  const necesario: CodigoPermiso = existe ? 'receta.editar' : 'receta.crear';
  if (!permisos.includes(necesario)) {
    throw new AppError(403, 'No tenés permiso para esta acción');
  }
}

export function createRecetaService(repo: RecetaRepository) {
  async function obtenerIntermedio(restauranteId: string, id: string) {
    const catalogo = await repo.cargarCatalogo(restauranteId);
    const intermedio = catalogo.get(id);
    if (intermedio?.tipo !== 'INTERMEDIO') {
      throw new AppError(404, 'El producto intermedio no existe');
    }
    return { catalogo, intermedio };
  }

  async function obtenerPlato(restauranteId: string, itemId: string) {
    const plato = await repo.buscarPlato(restauranteId, itemId);
    if (!plato) throw new AppError(404, 'El plato no existe');
    return plato;
  }

  const duenoIntermedio = (c: Componente): RecetaDetalle['dueno'] => ({
    tipo: 'INTERMEDIO',
    id: c.id,
    nombre: c.nombre,
    unidadBase: c.unidadBase,
  });

  const service = {
    async listar(restauranteId: string): Promise<ResumenRecetas> {
      const [catalogo, platos] = await Promise.all([
        repo.cargarCatalogo(restauranteId),
        repo.listarPlatos(restauranteId),
      ]);
      return {
        platos: platos.map((p) => {
          const receta = p.receta && armarReceta(p.receta, catalogo);
          return {
            id: p.id,
            nombre: p.nombre,
            categoria: p.categoria,
            activo: p.activo,
            tieneReceta: receta !== null,
            costoPorPorcion: receta && costoTotal(receta) / receta.rendimiento,
          };
        }),
        intermedios: [...catalogo.values()]
          .filter((c) => c.tipo === 'INTERMEDIO')
          .map((c) => ({
            id: c.id,
            nombre: c.nombre,
            unidadBase: c.unidadBase,
            activo: c.activo,
            tieneReceta: c.receta !== null,
            costoUnitario: costoUnitario(c),
          })),
      };
    },

    // Componentes que se pueden agregar a una receta.
    async componentes(restauranteId: string): Promise<ComponenteReceta[]> {
      const catalogo = await repo.cargarCatalogo(restauranteId);
      return [...catalogo.values()]
        .filter((c) => c.activo)
        .map((c) => ({
          id: c.id,
          nombre: c.nombre,
          tipo: c.tipo,
          unidadBase: c.unidadBase,
          costoUnitario: costoUnitario(c),
        }));
    },

    async obtenerDePlato(restauranteId: string, itemId: string): Promise<RecetaDetalle> {
      const plato = await obtenerPlato(restauranteId, itemId);
      const catalogo = plato.receta ? await repo.cargarCatalogo(restauranteId) : new Map();
      return detalle(
        { tipo: 'PLATO', id: plato.id, nombre: plato.nombre, unidadBase: null },
        plato.receta && armarReceta(plato.receta, catalogo),
      );
    },

    async obtenerDeIntermedio(restauranteId: string, id: string): Promise<RecetaDetalle> {
      const { intermedio } = await obtenerIntermedio(restauranteId, id);
      return detalle(duenoIntermedio(intermedio), intermedio.receta);
    },

    async guardarDePlato(
      restauranteId: string,
      itemId: string,
      datos: RecetaInput,
      permisos: readonly CodigoPermiso[],
    ) {
      const plato = await obtenerPlato(restauranteId, itemId);
      verificarPermiso(permisos, plato.receta !== null);
      const catalogo = await repo.cargarCatalogo(restauranteId);
      const receta = construir(RecetaBuilder.paraItem(), datos, catalogo);
      await repo.guardarRecetaPlato(restauranteId, itemId, receta);
      return service.obtenerDePlato(restauranteId, itemId);
    },

    async guardarDeIntermedio(
      restauranteId: string,
      id: string,
      datos: RecetaInput,
      permisos: readonly CodigoPermiso[],
    ) {
      const { catalogo, intermedio } = await obtenerIntermedio(restauranteId, id);
      if (!intermedio.activo) throw new AppError(409, 'El producto intermedio está dado de baja');
      verificarPermiso(permisos, intermedio.receta !== null);
      const receta = construir(RecetaBuilder.paraIntermedio(intermedio), datos, catalogo);
      await repo.guardarRecetaIntermedio(restauranteId, id, receta);
      return service.obtenerDeIntermedio(restauranteId, id);
    },

    // Flujo A del CU-07: el intermedio nace junto con su receta.
    async crearIntermedio(restauranteId: string, datos: IntermedioAlta) {
      if (await repo.existeNombre(restauranteId, datos.nombre)) {
        throw new AppError(
          409,
          `Ya existe un insumo o producto intermedio llamado "${datos.nombre}"`,
        );
      }
      const catalogo = await repo.cargarCatalogo(restauranteId);
      // Todavía no existe, así que ninguna receta lo usa: no puede haber ciclos.
      const nuevo: Componente = {
        id: randomUUID(),
        nombre: datos.nombre,
        tipo: 'INTERMEDIO',
        unidadBase: datos.unidadBase,
        activo: true,
        costoCompra: null,
        receta: null,
      };
      const receta = construir(RecetaBuilder.paraIntermedio(nuevo), datos.receta, catalogo);
      const id = await repo.crearIntermedio(restauranteId, datos.nombre, datos.unidadBase, receta);
      return service.obtenerDeIntermedio(restauranteId, id);
    },

    async borrarDePlato(restauranteId: string, itemId: string) {
      const plato = await obtenerPlato(restauranteId, itemId);
      if (!plato.receta) throw new AppError(404, 'El plato no tiene receta');
      await repo.borrarRecetaPlato(restauranteId, itemId);
    },

    async desactivarIntermedio(restauranteId: string, id: string) {
      const { intermedio } = await obtenerIntermedio(restauranteId, id);
      const usos = await repo.usosDeComponente(restauranteId, id);
      if (usos.length > 0) {
        throw new AppError(
          409,
          `${intermedio.nombre} se usa en las recetas de ${usos.join(', ')}: sacalo de esas recetas antes de darlo de baja`,
        );
      }
      await repo.desactivarIntermedio(restauranteId, id);
    },
  };
  return service;
}

export const recetaService = createRecetaService(recetaRepository);
