import { ESTADOS_RESERVA, type EstadoReserva } from '@pgim/shared';
import { estadoDeReserva, limiteDeLlegada, ocupaLaMesa, type ContextoReserva } from './reserva';

// 20:00 en Argentina, con 15 minutos de tolerancia.
const inicio = new Date('2026-10-30T23:00:00.000Z');

function ctx(ahora: string): ContextoReserva {
  return { inicio, toleranciaNoShowMin: 15, ahora: new Date(ahora) };
}

describe('estados de la reserva', () => {
  describe('PENDIENTE', () => {
    const pendiente = estadoDeReserva('PENDIENTE');

    it('se activa desde 30 minutos antes del inicio', () => {
      expect(pendiente.activar(ctx('2026-10-30T22:30:00.000Z'))).toBe('ACTIVA');
    });

    it('no se activa antes de los 30 minutos previos', () => {
      expect(() => pendiente.activar(ctx('2026-10-30T22:29:59.000Z'))).toThrow(
        expect.objectContaining({ status: 409 }),
      );
    });

    it('se activa hasta el fin de la tolerancia', () => {
      expect(pendiente.activar(ctx('2026-10-30T23:15:00.000Z'))).toBe('ACTIVA');
    });

    it('no se activa pasada la tolerancia', () => {
      expect(() => pendiente.activar(ctx('2026-10-30T23:15:01.000Z'))).toThrow(
        expect.objectContaining({ status: 409 }),
      );
    });

    it('se cancela antes del inicio', () => {
      expect(pendiente.cancelar(ctx('2026-10-30T22:59:59.000Z'))).toBe('CANCELADA');
    });

    it('no se cancela a la hora de inicio', () => {
      expect(() => pendiente.cancelar(ctx('2026-10-30T23:00:00.000Z'))).toThrow(
        expect.objectContaining({ status: 409 }),
      );
    });

    it('no vence al cumplirse justo la tolerancia', () => {
      expect(() => pendiente.vencer(ctx('2026-10-30T23:15:00.000Z'))).toThrow(
        expect.objectContaining({ status: 409 }),
      );
    });

    it('vence pasada la tolerancia', () => {
      expect(pendiente.vencer(ctx('2026-10-30T23:15:01.000Z'))).toBe('VENCIDA');
    });
  });

  describe('ACTIVA', () => {
    const activa = estadoDeReserva('ACTIVA');
    const momento = ctx('2026-10-30T23:05:00.000Z');

    it.each(['activar', 'cancelar', 'vencer'] as const)('no admite %s', (transicion) => {
      expect(() => activa[transicion](momento)).toThrow(expect.objectContaining({ status: 409 }));
    });
  });

  const finales: EstadoReserva[] = ['CANCELADA', 'VENCIDA', 'FINALIZADA'];

  it.each(
    finales.flatMap((nombre) =>
      (['activar', 'cancelar', 'vencer'] as const).map((t) => [nombre, t] as const),
    ),
  )('%s no admite %s', (nombre, transicion) => {
    const estado = estadoDeReserva(nombre);
    expect(estado.nombre).toBe(nombre);
    expect(() => estado[transicion](ctx('2026-10-30T22:45:00.000Z'))).toThrow(
      expect.objectContaining({ status: 409 }),
    );
  });

  it('cada estado del catálogo tiene su clase', () => {
    for (const nombre of ESTADOS_RESERVA) expect(estadoDeReserva(nombre).nombre).toBe(nombre);
  });

  it('el límite de llegada es el inicio más la tolerancia', () => {
    expect(limiteDeLlegada({ inicio, toleranciaNoShowMin: 15 }).toISOString()).toBe(
      '2026-10-30T23:15:00.000Z',
    );
  });

  describe('ocupaLaMesa', () => {
    const reserva = (estado: EstadoReserva) => ({ estado, inicio, toleranciaNoShowMin: 15 });
    const en = (iso: string) => new Date(iso);

    it('una pendiente la ocupa hasta el fin de la tolerancia', () => {
      expect(ocupaLaMesa(reserva('PENDIENTE'), en('2026-10-30T23:15:00.000Z'))).toBe(true);
      expect(ocupaLaMesa(reserva('PENDIENTE'), en('2026-10-30T23:15:01.000Z'))).toBe(false);
    });

    it('una activa la ocupa mientras dura su franja de 1 h', () => {
      expect(ocupaLaMesa(reserva('ACTIVA'), en('2026-10-30T23:59:59.000Z'))).toBe(true);
      expect(ocupaLaMesa(reserva('ACTIVA'), en('2026-10-31T00:00:00.000Z'))).toBe(false);
    });

    it.each(['CANCELADA', 'VENCIDA', 'FINALIZADA'] as const)('una %s no la ocupa', (estado) => {
      expect(ocupaLaMesa(reserva(estado), en('2026-10-30T22:00:00.000Z'))).toBe(false);
    });
  });
});
