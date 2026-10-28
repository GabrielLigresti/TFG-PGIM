import { crearPasarelaSimulada } from './pasarela';

describe('pasarela simulada', () => {
  it('aprueba al instante con una referencia marcada como de prueba', async () => {
    const pasarela = crearPasarelaSimulada(true);
    expect(pasarela.habilitada).toBe(true);
    expect(
      await pasarela.iniciarCobro({
        id: 'P1',
        monto: 1500,
        metodo: 'TARJETA',
        descripcion: 'Mesa',
      }),
    ).toEqual({ tipo: 'APROBADO_AL_INSTANTE', referenciaExterna: 'SIM-P1' });
  });

  it('nunca deja un pago en curso', async () => {
    expect(await crearPasarelaSimulada(true).consultarPago('P1')).toEqual({
      estado: 'SIN_APROBAR',
    });
  });

  it('deshabilitada no cobra', async () => {
    const pasarela = crearPasarelaSimulada(false);
    expect(pasarela.habilitada).toBe(false);
    await expect(
      pasarela.iniciarCobro({ id: 'P1', monto: 1500, metodo: 'TARJETA', descripcion: 'Mesa' }),
    ).rejects.toThrow();
  });
});
