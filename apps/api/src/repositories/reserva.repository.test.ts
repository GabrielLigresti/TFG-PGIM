import { filtroDeAlcance } from './reserva.repository';

jest.mock('../lib/prisma', () => ({ prisma: {} }));

describe('filtroDeAlcance', () => {
  it('el comensal solo alcanza sus propias reservas', () => {
    expect(filtroDeAlcance({ comensalId: 'C' })).toEqual({ comensalId: 'C' });
  });

  it('el personal solo alcanza las de su sucursal y su restaurante', () => {
    expect(filtroDeAlcance({ restauranteId: 'R', sucursalId: 'S' })).toEqual({
      sucursalId: 'S',
      sucursal: { restauranteId: 'R' },
    });
  });

  it('solo la tarea de sistema recorre todas', () => {
    expect(filtroDeAlcance({ sistema: true })).toEqual({});
  });
});
