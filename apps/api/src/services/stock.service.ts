import {
  CONVERSION,
  ETIQUETA_UNIDAD,
  type MovimientoInput,
  type TipoMovimiento,
  type MotivoMerma,
} from '@pgim/shared';
import { costoUnitario, tieneStock, type Componente } from '../domain/receta';
import { AppError } from '../lib/errors';
import { recetaRepository, type RecetaRepository } from '../repositories/receta.repository';
import {
  AjusteSinDiferenciaError,
  ComponenteSinStockError,
  ExistenciaInsuficienteError,
  stockRepository,
  type ContextoMovimiento,
  type MovimientoARegistrar,
  type StockRepository,
} from '../repositories/stock.repository';

// Costos con 4 decimales, como la columna.
const redondearCosto = (valor: number) => Math.round(valor * 10000) / 10000;

export function createStockService(
  repo: StockRepository,
  catalogo: Pick<RecetaRepository, 'cargarCatalogo'> = recetaRepository,
) {
  async function componenteDelMovimiento(
    restauranteId: string,
    input: MovimientoInput,
  ): Promise<Componente> {
    const componente = (await catalogo.cargarCatalogo(restauranteId)).get(input.componenteId);
    if (!componente) throw new AppError(404, 'El componente no existe');
    if (!componente.activo) throw new AppError(422, `${componente.nombre} está dado de baja`);
    if (input.tipo === 'INGRESO' && componente.tipo !== 'INSUMO') {
      throw new AppError(
        422,
        `${componente.nombre} es un producto intermedio: se carga como tanda de producción`,
      );
    }
    if (!tieneStock(componente)) {
      throw new AppError(422, `${componente.nombre} no lleva stock`);
    }
    if (CONVERSION[input.unidad].base !== componente.unidadBase) {
      throw new AppError(
        400,
        `La unidad no corresponde a ${componente.nombre}, que se mide en ${ETIQUETA_UNIDAD[componente.unidadBase]}`,
      );
    }
    return componente;
  }

  function aMovimiento(input: MovimientoInput, componente: Componente): MovimientoARegistrar {
    const { factor } = CONVERSION[input.unidad];
    switch (input.tipo) {
      case 'INGRESO':
        return {
          tipo: 'INGRESO',
          componenteId: componente.id,
          cantidad: input.cantidad * factor,
          // El costo se carga por la unidad elegida: se guarda por unidad base.
          costoUnitario: redondearCosto(input.costoUnitario / factor),
        };
      case 'MERMA':
        return {
          tipo: 'MERMA',
          componenteId: componente.id,
          cantidad: input.cantidad * factor,
          costoUnitario: redondearCosto(costoUnitario(componente)),
          motivoMerma: input.motivoMerma,
          observacion: input.observacion || null,
        };
      case 'AJUSTE':
        return {
          tipo: 'AJUSTE',
          componenteId: componente.id,
          cantidadContada: input.cantidadContada * factor,
          costoUnitario: redondearCosto(costoUnitario(componente)),
          motivo: input.motivo,
        };
    }
  }

  return {
    listar: (restauranteId: string, sucursalId: string) =>
      repo.listarComponentes(restauranteId, sucursalId),

    async registrar(ctx: ContextoMovimiento, input: MovimientoInput) {
      const componente = await componenteDelMovimiento(ctx.restauranteId, input);
      try {
        return await repo.registrarMovimiento(ctx, aMovimiento(input, componente));
      } catch (err) {
        if (err instanceof ExistenciaInsuficienteError) {
          throw new AppError(
            409,
            `No alcanza el stock de ${componente.nombre}: hay ${err.existencia} ${ETIQUETA_UNIDAD[componente.unidadBase]}`,
          );
        }
        if (err instanceof ComponenteSinStockError) {
          throw new AppError(409, `${componente.nombre} ya no lleva stock o está dado de baja`);
        }
        if (err instanceof AjusteSinDiferenciaError) {
          throw new AppError(422, 'El conteo coincide con el stock; no hay nada que ajustar');
        }
        throw err;
      }
    },

    movimientos: (
      restauranteId: string,
      sucursalId: string,
      filtro: {
        componenteId?: string;
        tipo?: TipoMovimiento;
        motivoMerma?: MotivoMerma;
        pagina: number;
      },
    ) => repo.listarMovimientos(restauranteId, sucursalId, filtro),
  };
}

export const stockService = createStockService(stockRepository);
