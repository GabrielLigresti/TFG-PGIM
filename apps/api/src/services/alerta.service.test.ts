import { tiposAlertaVisibles } from '@pgim/shared';

describe('tiposAlertaVisibles', () => {
  it('stock.registrar ve las dos de stock', () => {
    expect(tiposAlertaVisibles(['stock.registrar'])).toEqual([
      'STOCK_INSUFICIENTE',
      'PLATO_SIN_RECETA',
    ]);
  });

  it('reserva.ver ve la inasistencia', () => {
    expect(tiposAlertaVisibles(['reserva.ver'])).toEqual(['INASISTENCIA']);
  });

  it('con ambos permisos ve los tres', () => {
    expect(tiposAlertaVisibles(['reserva.ver', 'stock.registrar'])).toEqual([
      'STOCK_INSUFICIENTE',
      'PLATO_SIN_RECETA',
      'INASISTENCIA',
    ]);
  });

  it('sin ninguno no ve nada', () => {
    expect(tiposAlertaVisibles(['pedido.ver'])).toEqual([]);
  });
});
