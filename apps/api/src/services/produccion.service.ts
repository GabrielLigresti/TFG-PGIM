import {
  CONVERSION,
  ETIQUETA_UNIDAD,
  type Pagina,
  type PlanTanda,
  type TandaDetalle,
  type TandaInput,
  type TandaResumen,
  type UnidadMedida,
} from '@pgim/shared';
import { costoUnitario, insumosNecesarios, tieneStock, type Componente } from '../domain/receta';
import { calcularDesvio, costoTanda, type ConsumoTanda } from '../domain/tanda';
import { AppError } from '../lib/errors';
import { pedidoRepository, type PedidoRepository } from '../repositories/pedido.repository';
import {
  produccionRepository,
  type FiltroTandas,
  type ProduccionRepository,
  type TandaFila,
} from '../repositories/produccion.repository';
import { recetaRepository, type RecetaRepository } from '../repositories/receta.repository';
import {
  ComponenteSinStockError,
  ExistenciaInsuficienteError,
  type ContextoMovimiento,
} from '../repositories/stock.repository';

// Costos con 4 decimales, como la columna.
const redondearCosto = (valor: number) => Math.round(valor * 10000) / 10000;

const aResumen = (t: TandaFila): TandaResumen => ({
  id: t.id,
  fecha: t.fecha.toISOString(),
  intermedio: t.intermedio,
  esperada: t.esperada,
  obtenida: t.obtenida,
  empleado: t.empleado,
  desvio: calcularDesvio({ esperada: t.esperada, obtenida: t.obtenida, consumos: t.consumos }),
});

const aDetalle = (t: TandaFila): TandaDetalle => ({
  ...aResumen(t),
  observacion: t.observacion,
  costoUnitario: t.costoUnitario,
  consumos: t.consumos.map((c) => {
    const diferencia = c.usada - c.teorica;
    return {
      componente: c.componente,
      teorica: c.teorica,
      usada: c.usada,
      diferencia,
      diferenciaCosto: diferencia * c.costoUnitario,
    };
  }),
});

export function createProduccionService(
  repo: ProduccionRepository,
  catalogo: Pick<RecetaRepository, 'cargarCatalogo'> = recetaRepository,
  existencias: Pick<PedidoRepository, 'existencias'> = pedidoRepository,
) {
  function validarUnidad(componente: Componente, unidad: UnidadMedida) {
    if (CONVERSION[unidad].base !== componente.unidadBase) {
      throw new AppError(
        400,
        `La unidad no corresponde a ${componente.nombre}, que se mide en ${ETIQUETA_UNIDAD[componente.unidadBase]}`,
      );
    }
  }

  // Un intermedio con stock, activo y con receta.
  function validarIntermedio(intermedio: Componente | undefined): Componente {
    if (!intermedio) throw new AppError(404, 'El producto intermedio no existe');
    if (intermedio.tipo !== 'INTERMEDIO' || !intermedio.llevaStock) {
      throw new AppError(422, `${intermedio.nombre} no se produce por tandas`);
    }
    if (!intermedio.activo) throw new AppError(422, `${intermedio.nombre} está dado de baja`);
    if (!intermedio.receta) throw new AppError(422, `${intermedio.nombre} no tiene receta`);
    return intermedio;
  }

  async function detalle(
    restauranteId: string,
    sucursalId: string,
    id: string,
  ): Promise<TandaDetalle> {
    const tanda = await repo.buscarTanda(restauranteId, sucursalId, id);
    if (!tanda) throw new AppError(404, 'La tanda no existe');
    return aDetalle(tanda);
  }

  return {
    // Sin escribir: lo que habría que consumir para la cantidad a producir.
    async plan(
      restauranteId: string,
      sucursalId: string,
      q: { intermedioId: string; cantidad: number; unidad: UnidadMedida },
    ): Promise<PlanTanda> {
      const mapa = await catalogo.cargarCatalogo(restauranteId);
      const intermedio = validarIntermedio(mapa.get(q.intermedioId));
      validarUnidad(intermedio, q.unidad);
      const esperada = q.cantidad * CONVERSION[q.unidad].factor;
      const stock = await existencias.existencias(sucursalId);
      const consumos = [...insumosNecesarios(intermedio.receta!, esperada)].map(([id, teorica]) => {
        const c = mapa.get(id)!;
        return {
          componente: { id: c.id, nombre: c.nombre, unidadBase: c.unidadBase },
          teorica,
          existencia: stock.get(id) ?? 0,
        };
      });
      return {
        intermedio: {
          id: intermedio.id,
          nombre: intermedio.nombre,
          unidadBase: intermedio.unidadBase,
        },
        esperada,
        consumos,
      };
    },

    async registrar(ctx: ContextoMovimiento, input: TandaInput): Promise<TandaDetalle> {
      const mapa = await catalogo.cargarCatalogo(ctx.restauranteId);
      const intermedio = validarIntermedio(mapa.get(input.intermedioId));
      validarUnidad(intermedio, input.unidad);
      const { factor } = CONVERSION[input.unidad];
      const esperada = input.cantidadPlaneada * factor;
      const obtenida = input.cantidadObtenida * factor;

      // Lo teórico sale siempre de la receta, nunca del cliente.
      const teoricas = insumosNecesarios(intermedio.receta!, esperada);
      const consumos: ConsumoTanda[] = [];
      const vistos = new Set<string>();
      for (const pedido of input.consumos) {
        const componente = mapa.get(pedido.componenteId);
        if (!componente) throw new AppError(404, 'El componente no existe');
        if (componente.id === intermedio.id) {
          throw new AppError(422, `${componente.nombre} no puede consumirse en su propia tanda`);
        }
        if (vistos.has(componente.id)) {
          throw new AppError(422, `${componente.nombre} está repetido`);
        }
        vistos.add(componente.id);
        if (!componente.activo) throw new AppError(422, `${componente.nombre} está dado de baja`);
        if (!tieneStock(componente)) {
          throw new AppError(422, `${componente.nombre} no lleva stock`);
        }
        validarUnidad(componente, pedido.unidad);
        consumos.push({
          componenteId: componente.id,
          teorica: teoricas.get(componente.id) ?? 0,
          usada: pedido.cantidad * CONVERSION[pedido.unidad].factor,
          costoUnitario: redondearCosto(costoUnitario(componente)),
        });
      }
      // Lo que la receta pide y el cocinero quitó: no se usó, pero cuenta en el desvío.
      for (const [id, teorica] of teoricas) {
        if (vistos.has(id)) continue;
        consumos.push({
          componenteId: id,
          teorica,
          usada: 0,
          costoUnitario: redondearCosto(costoUnitario(mapa.get(id)!)),
        });
      }

      let id: string;
      try {
        id = await repo.registrarTanda(ctx, {
          intermedioId: intermedio.id,
          esperada,
          obtenida,
          observacion: input.observacion || null,
          consumos,
          costoUnitarioTanda: redondearCosto(costoTanda(consumos, obtenida)),
        });
      } catch (err) {
        if (err instanceof ComponenteSinStockError) {
          throw new AppError(409, `${intermedio.nombre} ya no lleva stock o está dado de baja`);
        }
        if (err instanceof ExistenciaInsuficienteError) {
          const faltante = mapa.get(err.componenteId);
          throw new AppError(
            409,
            `No alcanza el stock de ${faltante?.nombre ?? 'un componente'}: hay ${err.existencia} ${faltante ? ETIQUETA_UNIDAD[faltante.unidadBase] : ''}`.trimEnd(),
          );
        }
        throw err;
      }
      return detalle(ctx.restauranteId, ctx.sucursalId, id);
    },

    async listar(
      restauranteId: string,
      sucursalId: string,
      filtro: FiltroTandas,
    ): Promise<Pagina<TandaResumen>> {
      const pagina = await repo.listarTandas(restauranteId, sucursalId, filtro);
      return { ...pagina, filas: pagina.filas.map(aResumen) };
    },

    detalle,
  };
}

export const produccionService = createProduccionService(produccionRepository);
