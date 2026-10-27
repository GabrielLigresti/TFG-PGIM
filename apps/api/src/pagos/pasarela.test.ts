import { crearPasarelaSimulada } from './pasarela';

describe('pasarela simulada', () => {
  it('aprueba al instante con una referencia marcada como de prueba', async () => {
    const pasarela = crearPasarelaSimulada(true);
    expect(pasarela.habilitada).toBe(true);
    expect(await pasarela.cobrar({ id: 'P1', monto: 1500 })).toEqual({
      estado: 'APROBADO',
      referenciaExterna: 'SIM-P1',
    });
  });

  it('deshabilitada no cobra', async () => {
    const pasarela = crearPasarelaSimulada(false);
    expect(pasarela.habilitada).toBe(false);
    await expect(pasarela.cobrar({ id: 'P1', monto: 1500 })).rejects.toThrow();
  });
});
