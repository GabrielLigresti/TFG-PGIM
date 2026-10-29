import type {
  BeneficioInput,
  BeneficioPanel,
  GrupoInput,
  GrupoPanel,
  ProgramaInput,
  ProgramaPanel,
} from '@pgim/shared';
import { estadoBeneficio, relanzar } from '../domain/beneficio';
import { AppError } from '../lib/errors';
import {
  fidelizacionRepository,
  type DatosNuevoBeneficio,
  type FidelizacionRepository,
  type FilaBeneficio,
} from '../repositories/fidelizacion.repository';

const CAMBIO = 'El beneficio cambió mientras tanto. Recargá la página y probá de nuevo.';

// CU-17: programa de puntos, grupos y beneficios del restaurante.
export function createFidelizacionService(
  repo: FidelizacionRepository,
  ahora: () => Date = () => new Date(),
) {
  function aPanel(b: FilaBeneficio): BeneficioPanel {
    return {
      id: b.id,
      nombre: b.nombre,
      clase: b.clase,
      grupo: b.grupo,
      menu: b.menu,
      criterioTipo: b.criterioTipo,
      // NUEVO_CLIENTE guarda 1 solo porque el DER lo exige; no tiene valor.
      criterioValor: b.criterioTipo === 'NUEVO_CLIENTE' ? null : b.criterioValor,
      tipoDescuento: b.tipoDescuento,
      valor: b.valor,
      vigenciaDesde: b.vigenciaDesde.toISOString(),
      vigenciaHasta: b.vigenciaHasta.toISOString(),
      stockInicial: b.stockInicial,
      stockDisponible: b.stockDisponible,
      estado: estadoBeneficio(b, ahora()),
      pagosEnCurso: b.pagosEnCurso,
    };
  }

  async function beneficioDelRestaurante(restauranteId: string, id: string) {
    const b = await repo.beneficio(restauranteId, id);
    if (!b) throw new AppError(404, 'El beneficio no existe');
    return b;
  }

  // Normaliza lo que el esquema deja pasar según la clase y verifica que el
  // menú y el grupo sean del restaurante.
  async function datosDe(
    restauranteId: string,
    input: BeneficioInput,
  ): Promise<DatosNuevoBeneficio> {
    const promocion = input.clase === 'PROMOCION';
    const datos: DatosNuevoBeneficio = {
      nombre: input.nombre,
      clase: input.clase,
      grupoId: input.grupoId ?? null,
      menuId: promocion ? (input.menuId ?? null) : null,
      criterioTipo: promocion ? null : (input.criterioTipo ?? null),
      criterioValor: promocion
        ? null
        : input.criterioTipo === 'NUEVO_CLIENTE'
          ? 1
          : (input.criterioValor ?? null),
      tipoDescuento: input.tipoDescuento,
      valor: input.valor,
      vigenciaDesde: new Date(input.vigenciaDesde),
      vigenciaHasta: new Date(input.vigenciaHasta),
      stockInicial: input.stockInicial ?? null,
    };
    if (datos.menuId && !(await repo.existeMenu(restauranteId, datos.menuId))) {
      throw new AppError(404, 'El menú no existe');
    }
    if (datos.grupoId && !(await repo.existeGrupo(restauranteId, datos.grupoId))) {
      throw new AppError(404, 'El grupo no existe');
    }
    return datos;
  }

  const esProgramado = (b: FilaBeneficio) => estadoBeneficio(b, ahora()) === 'PROGRAMADO';
  const esVigente = (b: FilaBeneficio) => estadoBeneficio(b, ahora()) === 'VIGENTE';

  return {
    programa: (restauranteId: string): Promise<ProgramaPanel | null> =>
      repo.programa(restauranteId),

    async crearPrograma(restauranteId: string, input: ProgramaInput): Promise<ProgramaPanel> {
      if (!(await repo.crearPrograma(restauranteId, input.puntosPorUnidad))) {
        throw new AppError(409, 'El restaurante ya tiene un programa de puntos');
      }
      return { puntosPorUnidad: input.puntosPorUnidad };
    },

    grupos: (restauranteId: string): Promise<GrupoPanel[]> => repo.grupos(restauranteId),

    crearGrupo: (restauranteId: string, input: GrupoInput) =>
      repo.crearGrupo(restauranteId, input.nombre),

    async editarGrupo(restauranteId: string, id: string, input: GrupoInput): Promise<GrupoPanel> {
      const grupo = await repo.editarGrupo(restauranteId, id, input.nombre);
      if (!grupo) throw new AppError(404, 'El grupo no existe');
      return grupo;
    },

    async borrarGrupo(restauranteId: string, id: string): Promise<void> {
      const resultado = await repo.borrarGrupo(restauranteId, id);
      if (resultado === 'NO_EXISTE') throw new AppError(404, 'El grupo no existe');
      if (resultado === 'CON_BENEFICIOS') {
        throw new AppError(409, 'El grupo tiene beneficios. Sacalos del grupo antes de borrarlo.');
      }
    },

    async beneficios(
      restauranteId: string,
      filtros: { clase?: BeneficioInput['clase']; grupoId?: string },
    ): Promise<BeneficioPanel[]> {
      return (await repo.beneficios(restauranteId, filtros)).map(aPanel);
    },

    async crearBeneficio(restauranteId: string, input: BeneficioInput): Promise<BeneficioPanel> {
      return aPanel(await repo.crearBeneficio(restauranteId, await datosDe(restauranteId, input)));
    },

    // Solo antes de que empiece: uno vigente no se interrumpe ni se edita.
    async editarBeneficio(
      restauranteId: string,
      id: string,
      input: BeneficioInput,
    ): Promise<BeneficioPanel> {
      const actual = await beneficioDelRestaurante(restauranteId, id);
      if (!esProgramado(actual)) {
        throw new AppError(
          409,
          esVigente(actual)
            ? 'No se puede editar un beneficio vigente'
            : 'Solo se puede editar un beneficio que todavía no empezó',
        );
      }
      const datos = await datosDe(restauranteId, input);
      if (!(await repo.editarBeneficio(restauranteId, id, datos, esProgramado))) {
        throw new AppError(409, CAMBIO);
      }
      return aPanel(await beneficioDelRestaurante(restauranteId, id));
    },

    async relanzarBeneficio(restauranteId: string, id: string): Promise<BeneficioPanel> {
      const actual = await beneficioDelRestaurante(restauranteId, id);
      if (actual.pagosEnCurso > 0) {
        throw new AppError(409, 'Hay pagos en curso con este beneficio. Esperá a que terminen.');
      }
      relanzar(actual, ahora()); // lanza el 409 que corresponde si no está terminado
      const relanzado = await repo.relanzarBeneficio(restauranteId, id, (b) => {
        if (b.pagosEnCurso > 0) return null;
        try {
          return relanzar(b, ahora());
        } catch {
          return null;
        }
      });
      if (!relanzado) throw new AppError(409, CAMBIO);
      return aPanel(await beneficioDelRestaurante(restauranteId, id));
    },

    async darDeBajaBeneficio(restauranteId: string, id: string): Promise<void> {
      const actual = await beneficioDelRestaurante(restauranteId, id);
      if (esVigente(actual)) {
        throw new AppError(
          409,
          'No se puede dar de baja un beneficio vigente. Esperá a que termine.',
        );
      }
      if (!(await repo.darDeBajaBeneficio(restauranteId, id, (b) => !esVigente(b)))) {
        throw new AppError(409, CAMBIO);
      }
    },
  };
}

export const fidelizacionService = createFidelizacionService(fidelizacionRepository);
