import { createHmac } from 'node:crypto';
import { verificarFirma } from './firma';

const SECRETO = 'secreto-de-prueba';
const firmar = (manifiesto: string) =>
  createHmac('sha256', SECRETO).update(manifiesto).digest('hex');

describe('verificarFirma', () => {
  const v1 = firmar('id:abc123;request-id:req-1;ts:1700000000;');

  it('acepta la firma de Mercado Pago', () => {
    expect(
      verificarFirma({
        encabezado: `ts=1700000000,v1=${v1}`,
        requestId: 'req-1',
        dataId: 'abc123',
        secreto: SECRETO,
      }),
    ).toBe(true);
  });

  it('compara el id alfanumérico en minúsculas', () => {
    expect(
      verificarFirma({
        encabezado: `ts=1700000000,v1=${v1}`,
        requestId: 'req-1',
        dataId: 'ABC123',
        secreto: SECRETO,
      }),
    ).toBe(true);
  });

  it('rechaza una firma alterada, ausente o con otro request-id', () => {
    const base = { requestId: 'req-1', dataId: 'abc123', secreto: SECRETO };
    expect(verificarFirma({ ...base, encabezado: `ts=1700000000,v1=${'0'.repeat(64)}` })).toBe(
      false,
    );
    expect(verificarFirma({ ...base, encabezado: undefined })).toBe(false);
    expect(verificarFirma({ ...base, encabezado: 'basura' })).toBe(false);
    expect(
      verificarFirma({ ...base, requestId: 'otro', encabezado: `ts=1700000000,v1=${v1}` }),
    ).toBe(false);
  });
});
