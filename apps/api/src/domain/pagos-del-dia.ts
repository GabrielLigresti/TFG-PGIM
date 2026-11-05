import type { PagoDelDia, TotalesPagosDelDia } from '@pgim/shared';

const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Resume los pagos del día: solo los aprobados suman monto; el aprobado sin
// método (pago de $0 o pasarela de prueba) cuenta y va a SIN_METODO.
export function resumirPagosDelDia(pagos: PagoDelDia[]): TotalesPagosDelDia {
  const porMetodo = { TARJETA: 0, BILLETERA_VIRTUAL: 0, SIN_METODO: 0 };
  let cobrado = 0;
  let aprobados = 0;
  let rechazados = 0;
  for (const p of pagos) {
    if (p.estado === 'RECHAZADO') {
      rechazados += 1;
      continue;
    }
    aprobados += 1;
    cobrado += p.monto;
    porMetodo[p.metodo ?? 'SIN_METODO'] += p.monto;
  }
  return {
    cobrado: redondear(cobrado),
    aprobados,
    rechazados,
    porMetodo: {
      TARJETA: redondear(porMetodo.TARJETA),
      BILLETERA_VIRTUAL: redondear(porMetodo.BILLETERA_VIRTUAL),
      SIN_METODO: redondear(porMetodo.SIN_METODO),
    },
  };
}
