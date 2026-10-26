import { crearBusEventos, type EventoReserva } from '../domain/eventos';
import { registrarNotificadores } from './notificadores';

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

function ioFalso() {
  const emit = jest.fn();
  return { emit, io: { to: jest.fn(() => ({ emit })) } };
}

describe('notificadores', () => {
  it('un RESERVA_CREADA avisa a la sala de la sucursal y a la del comensal', () => {
    const { io, emit } = ioFalso();
    const bus = crearBusEventos();
    registrarNotificadores(io as never, bus);

    bus.publicar(evento);

    expect(io.to).toHaveBeenCalledWith('sucursal:S');
    expect(io.to).toHaveBeenCalledWith('comensal:C');
    expect(emit).toHaveBeenCalledWith('salon:cambio', {
      sucursalId: 'S',
      inicio: '2026-10-30T23:00:00.000Z',
      mesaId: 'M',
    });
    expect(emit).toHaveBeenCalledWith('reserva:cambio', { id: 'R', estado: 'PENDIENTE' });
  });

  it('la función devuelta deja de notificar', () => {
    const { io, emit } = ioFalso();
    const bus = crearBusEventos();
    const detener = registrarNotificadores(io as never, bus);

    detener();
    bus.publicar(evento);

    expect(emit).not.toHaveBeenCalled();
  });
});
