import { iniciarVencimientoReservas } from './vencimiento-reservas';

describe('tarea de vencimiento de reservas', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('corre al iniciar y cada intervalo', async () => {
    const vencer = jest.fn().mockResolvedValue(0);
    const detener = iniciarVencimientoReservas(vencer, 60_000);

    await jest.advanceTimersByTimeAsync(120_000);

    expect(vencer).toHaveBeenCalledTimes(3);
    detener();
  });

  it('no superpone ejecuciones', async () => {
    const vencer = jest.fn(() => new Promise<number>(() => {}));
    const detener = iniciarVencimientoReservas(vencer, 60_000);

    await jest.advanceTimersByTimeAsync(180_000);

    expect(vencer).toHaveBeenCalledTimes(1);
    detener();
  });

  it('la función devuelta la detiene', async () => {
    const vencer = jest.fn().mockResolvedValue(0);
    const detener = iniciarVencimientoReservas(vencer, 60_000);
    await jest.advanceTimersByTimeAsync(0);

    detener();
    await jest.advanceTimersByTimeAsync(180_000);

    expect(vencer).toHaveBeenCalledTimes(1);
  });

  it('un error no detiene la tarea', async () => {
    const consola = jest.spyOn(console, 'error').mockImplementation();
    const vencer = jest.fn().mockRejectedValueOnce(new Error('sin base')).mockResolvedValue(0);
    const detener = iniciarVencimientoReservas(vencer, 60_000);

    await jest.advanceTimersByTimeAsync(60_000);

    expect(vencer).toHaveBeenCalledTimes(2);
    expect(consola).toHaveBeenCalled();
    detener();
    consola.mockRestore();
  });
});
