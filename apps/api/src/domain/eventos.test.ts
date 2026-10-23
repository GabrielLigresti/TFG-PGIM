import { crearBusEventos, type EventoReserva } from './eventos';

const evento: EventoReserva = {
  tipo: 'RESERVA_CREADA',
  reserva: {
    id: 'R',
    sucursalId: 'S',
    comensalId: 'C',
    mesaId: 'M',
    inicio: new Date('2026-10-30T23:00:00.000Z'),
    estado: 'PENDIENTE',
  },
};

describe('bus de eventos de dominio', () => {
  it('entrega el evento a cada oyente suscripto', () => {
    const bus = crearBusEventos();
    const a = jest.fn();
    const b = jest.fn();
    bus.suscribir(a);
    bus.suscribir(b);

    bus.publicar(evento);

    expect(a).toHaveBeenCalledWith(evento);
    expect(b).toHaveBeenCalledWith(evento);
  });

  it('suscribir devuelve una función que da de baja al oyente', () => {
    const bus = crearBusEventos();
    const oyente = jest.fn();
    const baja = bus.suscribir(oyente);

    baja();
    bus.publicar(evento);

    expect(oyente).not.toHaveBeenCalled();
  });

  it('un oyente que falla no impide que lleguen los demás ni corta a quien publica', () => {
    const consola = jest.spyOn(console, 'error').mockImplementation();
    const bus = crearBusEventos();
    const otro = jest.fn();
    bus.suscribir(() => {
      throw new Error('falla');
    });
    bus.suscribir(otro);

    expect(() => bus.publicar(evento)).not.toThrow();
    expect(otro).toHaveBeenCalledWith(evento);
    expect(consola).toHaveBeenCalled();
    consola.mockRestore();
  });
});
