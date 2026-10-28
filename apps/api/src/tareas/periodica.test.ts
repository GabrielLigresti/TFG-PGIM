import { iniciarTareaPeriodica } from './periodica';

describe('tarea periódica', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('corre al iniciar y cada intervalo', async () => {
    const vencer = jest.fn().mockResolvedValue(0);
    const detener = iniciarTareaPeriodica('vencer', vencer, 60_000);

    await jest.advanceTimersByTimeAsync(120_000);

    expect(vencer).toHaveBeenCalledTimes(3);
    detener();
  });

  it('no superpone ejecuciones', async () => {
    const vencer = jest.fn(() => new Promise<number>(() => {}));
    const detener = iniciarTareaPeriodica('vencer', vencer, 60_000);

    await jest.advanceTimersByTimeAsync(180_000);

    expect(vencer).toHaveBeenCalledTimes(1);
    detener();
  });

  it('la función devuelta la detiene', async () => {
    const vencer = jest.fn().mockResolvedValue(0);
    const detener = iniciarTareaPeriodica('vencer', vencer, 60_000);
    await jest.advanceTimersByTimeAsync(0);

    detener();
    await jest.advanceTimersByTimeAsync(180_000);

    expect(vencer).toHaveBeenCalledTimes(1);
  });

  it('un error no detiene la tarea', async () => {
    const consola = jest.spyOn(console, 'error').mockImplementation();
    const vencer = jest.fn().mockRejectedValueOnce(new Error('sin base')).mockResolvedValue(0);
    const detener = iniciarTareaPeriodica('vencer', vencer, 60_000);

    await jest.advanceTimersByTimeAsync(60_000);

    expect(vencer).toHaveBeenCalledTimes(2);
    expect(consola).toHaveBeenCalled();
    detener();
    consola.mockRestore();
  });
});

it('un error queda en el log con el nombre de la tarea y no la detiene', async () => {
  jest.useFakeTimers();
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const tarea = jest.fn().mockRejectedValue(new Error('base caída'));
  const detener = iniciarTareaPeriodica('vencer pagos', tarea, 60_000);
  await jest.advanceTimersByTimeAsync(60_000);
  expect(tarea).toHaveBeenCalledTimes(2);
  expect(error).toHaveBeenCalledWith('Error en la tarea vencer pagos', expect.any(Error));
  detener();
  error.mockRestore();
  jest.useRealTimers();
});
