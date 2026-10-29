import type {
  BeneficioDisponible,
  BeneficioNoAlcanzado,
  BeneficiosMesa,
  FidelidadComensal,
  RecompensaComensal,
  TipoCriterio,
  UnidadProgreso,
} from '@pgim/shared';
import { calcularDescuento, criterioDe, estadoBeneficio } from '../domain/beneficio';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import {
  beneficiosActivos,
  contextoMesa,
  cuentasDelComensal,
  elegibilidad,
  type ContextoMesa,
  type Elegibilidad,
  type ElegibilidadBeneficio,
} from '../repositories/elegibilidad';
import type { FilaBeneficio } from '../repositories/fidelizacion.repository';

// Beneficios del lado del comensal: qué puede usar al pagar su mesa y cuánto
// le falta para el resto (CU-06), y "Mis puntos".

export interface BeneficiosComensalRepository {
  contextoMesa(comensalId: string, cuentaMesaId: string): Promise<ContextoMesa | null>;
  beneficiosActivos(restauranteId: string, ahora: Date): Promise<FilaBeneficio[]>;
  elegibilidad(
    comensalId: string,
    restauranteId: string,
    beneficios: FilaBeneficio[],
  ): Promise<Elegibilidad>;
  cuentasDelComensal(comensalId: string): Promise<Omit<FidelidadComensal, 'recompensas'>[]>;
}

const UNIDAD: Record<TipoCriterio, UnidadProgreso> = {
  VISITAS: 'visitas',
  MONTO: 'pesos',
  PUNTOS: 'puntos',
  NUEVO_CLIENTE: 'primera visita',
};

const pesos = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 2,
});

export const descripcionBeneficio = (b: Pick<FilaBeneficio, 'tipoDescuento' | 'valor'>) =>
  b.tipoDescuento === 'PORCENTAJE'
    ? `${b.valor} % de descuento`
    : `${pesos.format(b.valor)} de descuento`;

// Primera visita se canjea una vez por edición. Visitas y monto vuelven a
// contar desde el último canje (lo resuelve el repositorio) y los puntos son
// un saldo: se canjea cada vez que alcanzan, porque el canje los descuenta.
const canjeadoEnCiclo = (b: FilaBeneficio, e: ElegibilidadBeneficio) =>
  e.canjeadoEnEdicion && b.criterioTipo === 'NUEVO_CLIENTE';

// Reparte los beneficios vigentes entre los que el comensal puede usar en esta
// mesa y los que todavía no alcanzó. La usa también el pago, para revalidar el
// beneficio elegido con la cuenta bloqueada.
export function clasificarBeneficios(
  beneficios: FilaBeneficio[],
  porBeneficio: Map<string, ElegibilidadBeneficio>,
  mesa: { menuActivoId: string | null; saldo: number },
  ahora: Date,
): Pick<BeneficiosMesa, 'disponibles' | 'noAlcanzados'> {
  const disponibles: BeneficioDisponible[] = [];
  const noAlcanzados: BeneficioNoAlcanzado[] = [];
  for (const b of beneficios) {
    if (estadoBeneficio(b, ahora) !== 'VIGENTE') continue;
    const base = { id: b.id, nombre: b.nombre, descripcion: descripcionBeneficio(b) };
    const disponible = () =>
      disponibles.push({ ...base, descuento: calcularDescuento(b, mesa.saldo) });

    if (b.clase === 'PROMOCION') {
      if (b.menu?.id === mesa.menuActivoId) disponible();
      continue;
    }
    const e = porBeneficio.get(b.id);
    if (!e || !b.criterioTipo || canjeadoEnCiclo(b, e)) continue;
    const criterio = criterioDe(b.criterioTipo, b.criterioValor);
    if (criterio.esElegible(e.datos)) disponible();
    else {
      noAlcanzados.push({
        ...base,
        progreso: { ...criterio.progreso(e.datos), unidad: UNIDAD[b.criterioTipo] },
      });
    }
  }
  return { disponibles, noAlcanzados };
}

export function createBeneficiosComensalService(
  repo: BeneficiosComensalRepository,
  ahora: () => Date = () => new Date(),
) {
  return {
    async deMesa(comensalId: string, cuentaMesaId: string): Promise<BeneficiosMesa> {
      const mesa = await repo.contextoMesa(comensalId, cuentaMesaId);
      if (!mesa) throw new AppError(404, 'La mesa no existe');
      const instante = ahora();
      const beneficios = await repo.beneficiosActivos(mesa.restauranteId, instante);
      const recompensas = beneficios.filter((b) => b.clase === 'RECOMPENSA');
      const { porBeneficio } = await repo.elegibilidad(comensalId, mesa.restauranteId, recompensas);
      const { disponibles, noAlcanzados } = clasificarBeneficios(
        beneficios,
        porBeneficio,
        mesa,
        instante,
      );
      return {
        disponibles: mesa.beneficioUsado || mesa.saldo <= 0 ? [] : disponibles,
        noAlcanzados,
        beneficioUsado: mesa.beneficioUsado,
      };
    },

    async fidelidad(comensalId: string): Promise<FidelidadComensal[]> {
      const cuentas = await repo.cuentasDelComensal(comensalId);
      const instante = ahora();
      return Promise.all(
        cuentas.map(async (cuenta) => {
          const recompensas = (
            await repo.beneficiosActivos(cuenta.restaurante.id, instante)
          ).filter((b) => b.clase === 'RECOMPENSA');
          const { porBeneficio } = await repo.elegibilidad(
            comensalId,
            cuenta.restaurante.id,
            recompensas,
          );
          const { disponibles, noAlcanzados } = clasificarBeneficios(
            recompensas,
            porBeneficio,
            { menuActivoId: null, saldo: 0 },
            instante,
          );
          const alcanzadas = new Set(disponibles.map((d) => d.id));
          return {
            ...cuenta,
            recompensas: recompensas.flatMap((b): RecompensaComensal[] => {
              if (alcanzadas.has(b.id)) {
                const progreso = criterioDe(b.criterioTipo!, b.criterioValor).progreso(
                  porBeneficio.get(b.id)!.datos,
                );
                return [
                  {
                    id: b.id,
                    nombre: b.nombre,
                    descripcion: descripcionBeneficio(b),
                    progreso: { ...progreso, unidad: UNIDAD[b.criterioTipo!] },
                    alcanzada: true,
                  },
                ];
              }
              const falta = noAlcanzados.find((n) => n.id === b.id);
              return falta ? [{ ...falta, alcanzada: false }] : [];
            }),
          };
        }),
      );
    },
  };
}

export const beneficiosComensalRepository: BeneficiosComensalRepository = {
  contextoMesa: (comensalId, cuentaMesaId) => contextoMesa(prisma, comensalId, cuentaMesaId),
  beneficiosActivos: (restauranteId, ahora) => beneficiosActivos(prisma, restauranteId, ahora),
  elegibilidad: (comensalId, restauranteId, beneficios) =>
    elegibilidad(prisma, comensalId, restauranteId, beneficios),
  cuentasDelComensal: (comensalId) => cuentasDelComensal(prisma, comensalId),
};

export const beneficiosComensalService = createBeneficiosComensalService(
  beneficiosComensalRepository,
);
