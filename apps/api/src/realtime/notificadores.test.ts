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
  // Por defecto no hay sockets conectados: los avisos filtrados por sesión no tienen a quién llegar.
  const vacio = () => ({ fetchSockets: jest.fn().mockResolvedValue([]) });
  return { emit, io: { to: jest.fn(() => ({ emit })), in: jest.fn(vacio) } };
}

const sesionDe = (tipo: 'EMPLEADO' | 'COMENSAL', permisos: string[], sucursalId = 'S') => ({
  usuario: { id: 'U', tipo },
  permisos,
  sucursalActiva: { id: sucursalId },
});
const socketDe = (sesion?: unknown) => ({ data: { sesion }, emit: jest.fn() });

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

  describe('una alerta nueva', () => {
    const alerta = (tipo: 'PLATO_SIN_RECETA' | 'INASISTENCIA') => ({
      id: 'A',
      tipo,
      severidad: 'ADVERTENCIA' as const,
      descripcion: 'x',
      creadaEn: '2026-10-30T23:00:00.000Z',
      insumo: null,
      plato: null,
    });
    const publicar = async (sockets: ReturnType<typeof socketDe>[], a = alerta('INASISTENCIA')) => {
      const { io } = ioFalso();
      io.in.mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue(sockets) });
      const bus = crearBusEventos();
      registrarNotificadores(io as never, bus);
      bus.publicar({ tipo: 'ALERTA_CREADA', sucursalId: 'S', alerta: a });
      await new Promise((r) => setImmediate(r));
      expect(io.in).toHaveBeenCalledWith('sucursal:S');
      expect(io.to).not.toHaveBeenCalled();
      return a;
    };

    it('llega solo a los sockets de la sucursal cuya sesión ve ese tipo', async () => {
      const reservas = socketDe(sesionDe('EMPLEADO', ['reserva.ver']));
      const stock = socketDe(sesionDe('EMPLEADO', ['stock.registrar']));
      const ambos = socketDe(sesionDe('EMPLEADO', ['stock.registrar', 'reserva.ver']));
      const otraSucursal = socketDe(sesionDe('EMPLEADO', ['reserva.ver'], 'OTRA'));
      const comensal = socketDe(sesionDe('COMENSAL', ['reserva.ver']));
      const sinSesion = socketDe(undefined);
      const a = await publicar([reservas, stock, ambos, otraSucursal, comensal, sinSesion]);
      expect(reservas.emit).toHaveBeenCalledWith('alerta:nueva', a);
      expect(ambos.emit).toHaveBeenCalledWith('alerta:nueva', a);
      for (const s of [stock, otraSucursal, comensal, sinSesion]) {
        expect(s.emit).not.toHaveBeenCalled();
      }
    });

    it('una alerta de stock llega a quien registra stock y no a quien solo ve reservas', async () => {
      const reservas = socketDe(sesionDe('EMPLEADO', ['reserva.ver']));
      const stock = socketDe(sesionDe('EMPLEADO', ['stock.registrar']));
      const a = await publicar([reservas, stock], alerta('PLATO_SIN_RECETA'));
      expect(stock.emit).toHaveBeenCalledWith('alerta:nueva', a);
      expect(reservas.emit).not.toHaveBeenCalled();
    });
  });

  it('confirmar la planificación avisa a la sala de la sucursal, sin datos', () => {
    const { io, emit } = ioFalso();
    const bus = crearBusEventos();
    registrarNotificadores(io as never, bus);

    bus.publicar({ tipo: 'PLANIFICACION_CONFIRMADA', sucursalId: 'S', planificacionId: 'PL' });

    expect(io.to).toHaveBeenCalledTimes(1);
    expect(io.to).toHaveBeenCalledWith('sucursal:S');
    expect(emit).toHaveBeenCalledWith('turnos:publicados');
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

  describe('un pago resuelto', () => {
    const pagoAprobado = {
      tipo: 'PAGO_APROBADO' as const,
      pagoId: 'P',
      cuentaMesaId: 'M',
      sucursalId: 'S',
      comensalId: 'C',
      puntosSumados: 0,
      desbloqueados: [],
    };
    const pagoRechazado = {
      tipo: 'PAGO_RECHAZADO' as const,
      pagoId: 'P',
      cuentaMesaId: 'M',
      sucursalId: 'S',
      comensalId: 'C',
    };
    const publicar = async (
      sockets: ReturnType<typeof socketDe>[],
      pago: typeof pagoAprobado | typeof pagoRechazado = pagoAprobado,
    ) => {
      const { io } = ioFalso();
      io.in.mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue(sockets) });
      const bus = crearBusEventos();
      registrarNotificadores(io as never, bus);
      bus.publicar(pago);
      await new Promise((r) => setImmediate(r));
      expect(io.in).toHaveBeenCalledWith('sucursal:S');
    };

    it('llega solo a los empleados de la sucursal con pago.ver', async () => {
      const conPago = socketDe(sesionDe('EMPLEADO', ['pago.ver']));
      const conPagoYPedidos = socketDe(sesionDe('EMPLEADO', ['pago.ver', 'pedido.ver']));
      const cocina = socketDe(sesionDe('EMPLEADO', ['pedido.ver']));
      const otraSucursal = socketDe(sesionDe('EMPLEADO', ['pago.ver'], 'OTRA'));
      const comensal = socketDe(sesionDe('COMENSAL', ['pago.ver']));
      const sinSesion = socketDe(undefined);
      await publicar([conPago, conPagoYPedidos, cocina, otraSucursal, comensal, sinSesion]);
      expect(conPago.emit).toHaveBeenCalledWith('pagos:cambio');
      expect(conPagoYPedidos.emit).toHaveBeenCalledWith('pagos:cambio');
      for (const s of [cocina, otraSucursal, comensal, sinSesion]) {
        expect(s.emit).not.toHaveBeenCalled();
      }
    });

    it('un pago rechazado también se avisa', async () => {
      const conPago = socketDe(sesionDe('EMPLEADO', ['pago.ver']));
      await publicar([conPago], pagoRechazado);
      expect(conPago.emit).toHaveBeenCalledWith('pagos:cambio');
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
