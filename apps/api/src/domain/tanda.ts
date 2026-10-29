import type { DesvioTanda } from '@pgim/shared';

// Cálculo puro del desvío de una tanda de producción (CU-22), sin Prisma.
// Las magnitudes son positivas y están en unidad base.

export interface ConsumoTanda {
  componenteId: string;
  teorica: number;
  usada: number;
  costoUnitario: number;
}

export interface DatosTanda {
  esperada: number;
  obtenida: number;
  consumos: ConsumoTanda[];
}

// Desvío = lo que se perdió por rendir menos de lo esperado + lo que se usó
// de más. Rendir más o usar menos no compensa: cada parte vale 0 como mínimo.
export function calcularDesvio({ esperada, obtenida, consumos }: DatosTanda): DesvioTanda {
  const costoTeorico = consumos.reduce((s, c) => s + c.teorica * c.costoUnitario, 0);
  const costoTeoricoUnitario = esperada > 0 ? costoTeorico / esperada : 0;
  const faltanteRendimiento = Math.max(0, esperada - obtenida) * costoTeoricoUnitario;
  const usoDeMas = consumos.reduce(
    (s, c) => s + Math.max(0, c.usada - c.teorica) * c.costoUnitario,
    0,
  );
  return {
    rendimientoReal: esperada > 0 ? obtenida / esperada : 0,
    faltanteRendimiento,
    usoDeMas,
    total: faltanteRendimiento + usoDeMas,
  };
}

// Costo por unidad base de lo obtenido: el costo real de lo usado ÷ lo obtenido.
export function costoTanda(consumos: ConsumoTanda[], obtenida: number): number {
  if (!(obtenida > 0)) return 0;
  return consumos.reduce((s, c) => s + c.usada * c.costoUnitario, 0) / obtenida;
}
