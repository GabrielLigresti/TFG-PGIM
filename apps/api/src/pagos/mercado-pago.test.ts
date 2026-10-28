import { crearPasarelaMercadoPago, obtenerCobro } from './mercado-pago';

const AHORA = new Date('2026-11-10T15:00:00.000Z');
const PAGO = '01900000-0000-7000-8000-0000000000aa';

function fetchFalso(respuesta: unknown, status = 200) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => respuesta,
    text: async () => JSON.stringify(respuesta),
  }) as unknown as jest.MockedFunction<typeof fetch>;
}

const config = (f: typeof fetch) => ({
  accessToken: 'TEST-token-secreto',
  publicUrl: 'https://ejemplo.trycloudflare.com',
  fetch: f,
  ahora: () => AHORA,
});

const cuerpo = (f: jest.MockedFunction<typeof fetch>) =>
  JSON.parse(f.mock.calls[0]![1]!.body as string);

describe('pasarela de Mercado Pago', () => {
  it('crea la preferencia de Checkout Pro con la referencia, el vencimiento y las URL', async () => {
    const f = fetchFalso({ init_point: 'https://mp.test/checkout' });
    const inicio = await crearPasarelaMercadoPago(config(f)).iniciarCobro({
      id: PAGO,
      monto: 18750,
      metodo: 'TARJETA',
      descripcion: 'Mesa 4 — La Parrilla Demo',
    });

    expect(inicio).toEqual({ tipo: 'REDIRECCION', urlPago: 'https://mp.test/checkout' });
    const [url, opciones] = f.mock.calls[0]!;
    expect(url).toBe('https://api.mercadopago.com/checkout/preferences');
    expect(opciones!.method).toBe('POST');
    expect((opciones!.headers as Record<string, string>).Authorization).toBe(
      'Bearer TEST-token-secreto',
    );
    expect(cuerpo(f)).toMatchObject({
      items: [
        { title: 'Mesa 4 — La Parrilla Demo', quantity: 1, unit_price: 18750, currency_id: 'ARS' },
      ],
      external_reference: PAGO,
      notification_url: 'https://ejemplo.trycloudflare.com/api/pagos/webhook/mercadopago',
      back_urls: {
        success: `https://ejemplo.trycloudflare.com/mesa?pago=${PAGO}`,
        failure: `https://ejemplo.trycloudflare.com/mesa?pago=${PAGO}`,
        pending: `https://ejemplo.trycloudflare.com/mesa?pago=${PAGO}`,
      },
      auto_return: 'approved',
      expires: true,
      expiration_date_to: '2026-11-10T15:15:00.000Z',
    });
  });

  it('con tarjeta excluye el dinero en cuenta y el efectivo', async () => {
    const f = fetchFalso({ init_point: 'x' });
    await crearPasarelaMercadoPago(config(f)).iniciarCobro({
      id: PAGO,
      monto: 1,
      metodo: 'TARJETA',
      descripcion: 'Mesa',
    });
    expect(cuerpo(f).payment_methods.excluded_payment_types).toEqual([
      { id: 'account_money' },
      { id: 'ticket' },
      { id: 'atm' },
    ]);
  });

  it('con dinero en cuenta excluye las tarjetas y el efectivo', async () => {
    const f = fetchFalso({ init_point: 'x' });
    await crearPasarelaMercadoPago(config(f)).iniciarCobro({
      id: PAGO,
      monto: 1,
      metodo: 'BILLETERA_VIRTUAL',
      descripcion: 'Mesa',
    });
    expect(cuerpo(f).payment_methods.excluded_payment_types).toEqual([
      { id: 'credit_card' },
      { id: 'debit_card' },
      { id: 'prepaid_card' },
      { id: 'ticket' },
      { id: 'atm' },
    ]);
  });

  it('un error de Mercado Pago no expone el token', async () => {
    const f = fetchFalso({ message: 'invalid' }, 401);
    const error = await crearPasarelaMercadoPago(config(f))
      .iniciarCobro({ id: PAGO, monto: 1, metodo: 'TARJETA', descripcion: 'Mesa' })
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('401');
    expect((error as Error).message).not.toContain('TEST-token-secreto');
  });

  describe('consultarPago busca todos los intentos de la preferencia', () => {
    const consultar = (results: unknown[]) => {
      const f = fetchFalso({ results });
      return {
        f,
        resultado: crearPasarelaMercadoPago(config(f)).consultarPago(PAGO),
      };
    };

    it('uno rechazado y otro aprobado: aprobado', async () => {
      const { f, resultado } = consultar([
        { id: 11, status: 'rejected', payment_type_id: 'credit_card' },
        { id: 12, status: 'approved', payment_type_id: 'debit_card' },
      ]);
      expect(await resultado).toEqual({
        estado: 'APROBADO',
        referenciaExterna: '12',
        metodo: 'TARJETA',
      });
      expect(f.mock.calls[0]![0]).toBe(
        `https://api.mercadopago.com/v1/payments/search?external_reference=${PAGO}`,
      );
    });

    it('uno rechazado y otro en proceso: en proceso', async () => {
      const { resultado } = consultar([
        { id: 11, status: 'rejected', payment_type_id: 'credit_card' },
        { id: 12, status: 'in_process', payment_type_id: 'credit_card' },
      ]);
      expect(await resultado).toEqual({ estado: 'EN_PROCESO' });
    });

    it('sin intentos: sin aprobar', async () => {
      expect(await consultar([]).resultado).toEqual({ estado: 'SIN_APROBAR' });
    });

    it('con dinero en cuenta: billetera virtual', async () => {
      const { resultado } = consultar([
        { id: 13, status: 'approved', payment_type_id: 'account_money' },
      ]);
      expect(await resultado).toMatchObject({ metodo: 'BILLETERA_VIRTUAL' });
    });
  });
});

describe('obtenerCobro', () => {
  it('trae el cobro por su id y lo traduce', async () => {
    const f = fetchFalso({
      id: 99,
      status: 'approved',
      external_reference: PAGO,
      payment_type_id: 'prepaid_card',
    });
    expect(await obtenerCobro(config(f), '99')).toEqual({
      estado: 'APROBADO',
      pagoId: PAGO,
      referenciaExterna: '99',
      metodo: 'TARJETA',
    });
    expect(f.mock.calls[0]![0]).toBe('https://api.mercadopago.com/v1/payments/99');
  });

  it('un cobro rechazado queda sin aprobar', async () => {
    const f = fetchFalso({
      id: 98,
      status: 'rejected',
      external_reference: PAGO,
      payment_type_id: 'credit_card',
    });
    expect(await obtenerCobro(config(f), '98')).toMatchObject({ estado: 'SIN_APROBAR' });
  });
});
