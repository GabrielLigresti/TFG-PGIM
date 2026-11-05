import type { PagoDelDia } from '@pgim/shared';
import { resumirPagosDelDia } from '../domain/pagos-del-dia';
import type { PagosDelDiaRepository } from '../repositories/pagos-del-dia.repository';
import { createPagosDelDiaService } from './pagos-del-dia.service';

const filas: PagoDelDia[] = [
  {
    id: 'p1',
    fecha: '2026-11-06T01:00:00.000Z',
    mesaNumero: 4,
    comensalNombre: 'Comensal de prueba',
    monto: 1500,
    metodo: 'TARJETA',
    estado: 'APROBADO',
    comprobanteNumero: '0001',
  },
];

describe('pagosDelDiaService', () => {
  it('consulta el día de Argentina y arma el resumen', async () => {
    const repo: jest.Mocked<PagosDelDiaRepository> = { delDia: jest.fn().mockResolvedValue(filas) };
    const res = await createPagosDelDiaService(repo).delDia(
      'R',
      'S',
      new Date('2026-11-06T02:00:00Z'),
    );
    expect(repo.delDia).toHaveBeenCalledWith('R', 'S', '2026-11-05');
    expect(res).toEqual({
      fecha: '2026-11-05',
      totales: resumirPagosDelDia(filas),
      pagos: filas,
    });
  });
});
