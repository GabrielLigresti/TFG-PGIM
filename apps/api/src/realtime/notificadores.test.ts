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

  const pedido = {
    id: 'P',
    numero: 1,
    mesa: { numero: 4 },
    creadoEn: '2026-10-30T23:00:00.000Z',
    listoEn: null,
    estado: 'CONFIRMADO' as const,
    lineas: [],
  };

  it('un pedido nuevo va solo a la sala del personal, nunca a la del salón', () => {
    const { io, emit } = ioFalso();
    const bus = crearBusEventos();
    registrarNotificadores(io as never, bus);

    bus.publicar({ tipo: 'PEDIDO_CONFIRMADO', pedido, sucursalId: 'S', comensalId: 'C' });

    expect(io.to).toHaveBeenCalledWith('personal:S');
    expect(io.to).not.toHaveBeenCalledWith('sucursal:S');
    expect(emit).toHaveBeenCalledWith('pedido:nuevo', pedido);
  });

  it('un cambio de estado del pedido avisa al personal y al titular', () => {
    const { io, emit } = ioFalso();
    const bus = crearBusEventos();
    registrarNotificadores(io as never, bus);
    const cambio = { id: 'P', estado: 'LISTO' as const, listoEn: '2026-10-30T23:10:00.000Z' };

    bus.publicar({ tipo: 'PEDIDO_CAMBIO_ESTADO', cambio, sucursalId: 'S', comensalId: 'C' });

    expect(io.to).toHaveBeenCalledWith('personal:S');
    expect(io.to).toHaveBeenCalledWith('comensal:C');
    expect(io.to).not.toHaveBeenCalledWith('sucursal:S');
    expect(emit).toHaveBeenCalledWith('pedido:cambio', cambio);
  });

  it('una alerta nueva va a la sala del personal', () => {
    const { io, emit } = ioFalso();
    const bus = crearBusEventos();
    registrarNotificadores(io as never, bus);
    const alerta = {
      id: 'A',
      tipo: 'PLATO_SIN_RECETA' as const,
      severidad: 'ADVERTENCIA' as const,
      descripcion: 'x',
      creadaEn: '2026-10-30T23:00:00.000Z',
      insumo: null,
      plato: { id: 'I', nombre: 'Agua' },
    };

    bus.publicar({ tipo: 'ALERTA_CREADA', sucursalId: 'S', alerta });

    expect(io.to).toHaveBeenCalledWith('personal:S');
    expect(emit).toHaveBeenCalledWith('alerta:nueva', alerta);
  });

  it('el cierre de la mesa avisa al titular', () => {
    const { io, emit } = ioFalso();
    const bus = crearBusEventos();
    registrarNotificadores(io as never, bus);

    bus.publicar({
      tipo: 'CUENTA_MESA_CERRADA',
      cuentaMesaId: 'CM',
      restauranteId: 'R',
      comensalId: 'C',
    });

    expect(io.to).toHaveBeenCalledWith('comensal:C');
    expect(emit).toHaveBeenCalledWith('mesa:cambio', { cuentaMesaId: 'CM' });
  });

  it('el resultado de un pago va solo al titular, con los puntos y lo desbloqueado', () => {
    const { io, emit } = ioFalso();
    const bus = crearBusEventos();
    registrarNotificadores(io as never, bus);

    bus.publicar({
      tipo: 'PAGO_APROBADO',
      pagoId: 'P',
      cuentaMesaId: 'M',
      sucursalId: 'S',
      comensalId: 'C',
      puntosSumados: 180,
      desbloqueados: ['Postre de regalo'],
    });

    expect(io.to).toHaveBeenCalledWith('comensal:C');
    expect(io.to).not.toHaveBeenCalledWith('sucursal:S');
    expect(emit).toHaveBeenCalledWith('pago:resultado', {
      pagoId: 'P',
      cuentaMesaId: 'M',
      estado: 'APROBADO',
      puntosSumados: 180,
      desbloqueados: ['Postre de regalo'],
    });
    expect(emit).toHaveBeenCalledWith('mesa:cambio', { cuentaMesaId: 'M' });
  });

  it('un pago rechazado avisa al titular sin puntos', () => {
    const { io, emit } = ioFalso();
    const bus = crearBusEventos();
    registrarNotificadores(io as never, bus);

    bus.publicar({
      tipo: 'PAGO_RECHAZADO',
      pagoId: 'P',
      cuentaMesaId: 'M',
      sucursalId: 'S',
      comensalId: 'C',
    });

    expect(emit).toHaveBeenCalledWith('pago:resultado', {
      pagoId: 'P',
      cuentaMesaId: 'M',
      estado: 'RECHAZADO',
      puntosSumados: 0,
      desbloqueados: [],
    });
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
