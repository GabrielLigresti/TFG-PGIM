import type { PagoDelDia } from '@pgim/shared';
import { resumirPagosDelDia } from './pagos-del-dia';

function pago(p: Partial<PagoDelDia>): PagoDelDia {
  return {
    id: 'p',
    fecha: '2026-11-05T15:00:00.000Z',
    mesaNumero: 1,
    comensalNombre: 'Comensal',
    monto: 0,
    metodo: 'TARJETA',
    estado: 'APROBADO',
    comprobanteNumero: null,
    ...p,
  };
}

describe('resumirPagosDelDia', () => {
  it('devuelve ceros sin pagos', () => {
    expect(resumirPagosDelDia([])).toEqual({
      cobrado: 0,
      aprobados: 0,
      rechazados: 0,
      porMetodo: { TARJETA: 0, BILLETERA_VIRTUAL: 0, SIN_METODO: 0 },
    });
  });

  it('suma solo los aprobados y cuenta el aprobado sin método', () => {
    const r = resumirPagosDelDia([
      pago({ monto: 1500, metodo: 'TARJETA' }),
      pago({ monto: 2000.5, metodo: 'BILLETERA_VIRTUAL' }),
      pago({ monto: 999, metodo: 'TARJETA', estado: 'RECHAZADO' }),
      pago({ monto: 0, metodo: null }),
    ]);
    expect(r).toEqual({
      cobrado: 3500.5,
      aprobados: 3,
      rechazados: 1,
      porMetodo: { TARJETA: 1500, BILLETERA_VIRTUAL: 2000.5, SIN_METODO: 0 },
    });
  });

  it('redondea a 2 decimales', () => {
    const r = resumirPagosDelDia([pago({ monto: 0.1 }), pago({ monto: 0.2 })]);
    expect(r.cobrado).toBe(0.3);
    expect(r.porMetodo.TARJETA).toBe(0.3);
  });
});
