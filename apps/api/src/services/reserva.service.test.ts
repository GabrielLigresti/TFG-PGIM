import type { Mesa, ReservaInput } from '@pgim/shared';
import type { BusEventos } from '../domain/eventos';
import type {
  FilaReserva,
  FilaReservaPanel,
  ReservaRepository,
  SucursalReservable,
} from '../repositories/reserva.repository';
import { createReservaService } from './reserva.service';

const S = '01900000-0000-7000-8000-000000000011';
const C = 'comensal';

// 20:30 del 30/10 en Argentina.
const AHORA = new Date('2026-10-30T23:30:00.000Z');
// 21:00 del 30/10 en Argentina.
const A_LAS_21 = '2026-10-31T00:00:00.000Z';

const sucursal: SucursalReservable = {
  id: S,
  nombre: 'Centro',
  restauranteId: 'restaurante',
  horarioApertura: '12:00',
  horarioCierre: '00:00',
  toleranciaNoShowMin: 15,
};

function mesa(id: string, numero: number, capacidad: number): Mesa {
  return { id, numero, capacidad, posX: 10 * numero, posY: 15, activa: true };
}

const mesas = [mesa('m1', 1, 2), mesa('m2', 2, 4), mesa('m3', 3, 6)];

function fila(cambios: Partial<FilaReserva> = {}): FilaReserva {
  return {
    id: 'R',
    sucursalId: S,
    sucursalNombre: 'Centro',
    comensalId: C,
    mesaId: 'm2',
    mesaNumero: 2,
    inicio: new Date(A_LAS_21),
    cantidadPersonas: 3,
    modoAsignacion: 'MANUAL',
    estado: 'PENDIENTE',
    toleranciaNoShowMin: 15,
    ...cambios,
  };
}

// 20:00 del 30/10 en Argentina.
const A_LAS_20 = '2026-10-30T23:00:00.000Z';

function filaPanel(cambios: Partial<FilaReservaPanel> = {}): FilaReservaPanel {
  return {
    ...fila({ inicio: new Date(A_LAS_20) }),
    comensalNombre: 'Carlos',
    comensalTelefono: null,
    ...cambios,
  };
}

function repoFalso(cambios: Partial<ReservaRepository> = {}): jest.Mocked<ReservaRepository> {
  return {
    buscarSucursalReservable: jest.fn().mockResolvedValue(sucursal),
    listarMesasActivas: jest.fn().mockResolvedValue(mesas),
    mesasOcupadas: jest.fn().mockResolvedValue([]),
    comensalTieneReservaEn: jest.fn().mockResolvedValue(false),
    crear: jest.fn().mockImplementation(async (d) => fila({ ...d, mesaNumero: 2 })),
    buscarDelComensal: jest.fn().mockResolvedValue(fila()),
    listarDelComensal: jest.fn().mockResolvedValue([fila()]),
    cambiarEstado: jest.fn().mockResolvedValue(true),
    listarDelDia: jest.fn().mockResolvedValue([filaPanel()]),
    buscarEnSucursal: jest.fn().mockResolvedValue(filaPanel()),
    activar: jest.fn().mockResolvedValue(true),
    pendientesIniciadas: jest.fn().mockResolvedValue([fila({ inicio: new Date(A_LAS_20) })]),
    ...cambios,
  } as jest.Mocked<ReservaRepository>;
}

function busFalso(): jest.Mocked<BusEventos> {
  return { publicar: jest.fn(), suscribir: jest.fn() };
}

function servicio(repo = repoFalso(), bus = busFalso(), ahora = AHORA) {
  return { repo, bus, service: createReservaService(repo, bus, () => ahora) };
}

const reserva = (cambios: Partial<ReservaInput> = {}): ReservaInput => ({
  sucursalId: S,
  inicio: A_LAS_21,
  personas: 3,
  mesaId: 'm2',
  ...cambios,
});

describe('reservaService', () => {
  describe('franjas disponibles', () => {
    it('no ofrece franjas que ya empezaron', async () => {
      const { service } = servicio();

      const franjas = await service.franjasDisponibles(S, '2026-10-30', 2);

      expect(franjas.map((f) => f.hora)).toEqual(['21:00', '22:00', '23:00']);
      expect(franjas[0]).toEqual({ inicio: A_LAS_21, hora: '21:00', mesasLibres: 3 });
    });

    it('cuenta solo las mesas libres que alcanzan', async () => {
      const repo = repoFalso({
        mesasOcupadas: jest.fn().mockResolvedValue([{ mesaId: 'm3', inicio: new Date(A_LAS_21) }]),
      });
      const { service } = servicio(repo);

      const franjas = await service.franjasDisponibles(S, '2026-10-30', 3);

      expect(franjas.map((f) => f.mesasLibres)).toEqual([1, 2, 2]);
    });

    it('una franja sin mesa que alcance no se ofrece', async () => {
      const { service } = servicio();

      expect(await service.franjasDisponibles(S, '2026-10-30', 7)).toEqual([]);
    });

    it.each(['2026-10-29', '2026-11-30'])(
      'rechaza fechas fuera del rango reservable con 400 (%s)',
      async (fecha) => {
        const { service } = servicio();

        await expect(service.franjasDisponibles(S, fecha, 2)).rejects.toMatchObject({
          status: 400,
        });
      },
    );

    it('una sucursal inexistente o inactiva responde 404', async () => {
      const { service } = servicio(
        repoFalso({ buscarSucursalReservable: jest.fn().mockResolvedValue(null) }),
      );

      await expect(service.franjasDisponibles(S, '2026-10-30', 2)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('mapa', () => {
    it('el mapa marca libres, reservadas y chicas', async () => {
      const repo = repoFalso({
        mesasOcupadas: jest.fn().mockResolvedValue([{ mesaId: 'm2', inicio: new Date(A_LAS_21) }]),
      });
      const { service } = servicio(repo);

      const mapa = await service.mapa(S, new Date(A_LAS_21), 3);

      expect(mapa.inicio).toBe(A_LAS_21);
      expect(mapa.mesas.map((m) => [m.numero, m.estado])).toEqual([
        [1, 'CHICA'],
        [2, 'RESERVADA'],
        [3, 'LIBRE'],
      ]);
    });
  });

  describe('reserva manual', () => {
    it('reserva la mesa elegida en modo MANUAL y publica RESERVA_CREADA', async () => {
      const { service, repo, bus } = servicio();

      const creada = await service.reservar(C, reserva());

      expect(repo.crear).toHaveBeenCalledWith({
        sucursalId: S,
        mesaId: 'm2',
        comensalId: C,
        inicio: new Date(A_LAS_21),
        cantidadPersonas: 3,
        modoAsignacion: 'MANUAL',
      });
      expect(bus.publicar).toHaveBeenCalledWith({
        tipo: 'RESERVA_CREADA',
        reserva: expect.objectContaining({ id: 'R', sucursalId: S, comensalId: C, mesaId: 'm2' }),
      });
      expect(bus.publicar.mock.invocationCallOrder[0]).toBeGreaterThan(
        repo.crear.mock.invocationCallOrder[0]!,
      );
      expect(creada).toMatchObject({
        sucursal: { id: S, nombre: 'Centro' },
        mesa: { id: 'm2', numero: 2 },
        inicio: A_LAS_21,
        estado: 'PENDIENTE',
        limiteLlegada: '2026-10-31T00:15:00.000Z',
        cancelable: true,
      });
    });

    it('rechaza una mesa chica con 409', async () => {
      const { service, repo } = servicio();

      await expect(service.reservar(C, reserva({ mesaId: 'm1' }))).rejects.toMatchObject({
        status: 409,
      });
      expect(repo.crear).not.toHaveBeenCalled();
    });

    it('rechaza una mesa inactiva o de otra sucursal con 404', async () => {
      const { service } = servicio();

      await expect(service.reservar(C, reserva({ mesaId: 'otra' }))).rejects.toMatchObject({
        status: 404,
      });
    });

    it('una mesa ya ocupada en la franja responde 409 La mesa ya no está disponible', async () => {
      const repo = repoFalso({
        mesasOcupadas: jest.fn().mockResolvedValue([{ mesaId: 'm2', inicio: new Date(A_LAS_21) }]),
      });
      const { service } = servicio(repo);

      await expect(service.reservar(C, reserva())).rejects.toMatchObject({
        status: 409,
        message: 'La mesa ya no está disponible',
      });
    });
  });

  describe('reserva automática', () => {
    it('asigna la mesa más chica que alcanza en modo AUTOMATICA', async () => {
      const { service, repo } = servicio();

      await service.reservar(C, reserva({ mesaId: null }));

      expect(repo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ mesaId: 'm2', modoAsignacion: 'AUTOMATICA' }),
      );
    });

    it('sin mesas libres responde 409 No hay mesas disponibles para esa franja', async () => {
      const { service } = servicio();

      await expect(
        service.reservar(C, reserva({ mesaId: null, personas: 9 })),
      ).rejects.toMatchObject({ status: 409, message: 'No hay mesas disponibles para esa franja' });
    });
  });

  it.each([
    ['a las 20:30', '2026-10-30T23:30:00.000Z'],
    ['antes de la apertura', '2026-10-30T14:00:00.000Z'],
    ['ya empezado', '2026-10-30T23:00:00.000Z'],
    ['a más de 30 días', '2026-12-01T00:00:00.000Z'],
  ])('rechaza un inicio que no es una franja de la sucursal con 400 (%s)', async (_, inicio) => {
    const { service, repo } = servicio();

    await expect(service.reservar(C, reserva({ inicio }))).rejects.toMatchObject({ status: 400 });
    await expect(service.mapa(S, new Date(inicio), 2)).rejects.toMatchObject({ status: 400 });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('si la base rechaza la reserva por la mesa tomada responde 409 La mesa ya no está disponible', async () => {
    const repo = repoFalso({ crear: jest.fn().mockRejectedValue({ code: 'P2002' }) });
    const { service, bus } = servicio(repo);

    await expect(service.reservar(C, reserva())).rejects.toMatchObject({
      status: 409,
      message: 'La mesa ya no está disponible',
    });
    expect(bus.publicar).not.toHaveBeenCalled();
  });

  it('un comensal no puede tener dos reservas vigentes a la misma hora', async () => {
    const repo = repoFalso({ comensalTieneReservaEn: jest.fn().mockResolvedValue(true) });
    const { service } = servicio(repo);

    await expect(service.reservar(C, reserva())).rejects.toMatchObject({ status: 409 });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('tampoco si otra reserva suya a esa hora entra mientras tanto', async () => {
    const repo = repoFalso({ crear: jest.fn().mockResolvedValue(null) });
    const { service, bus } = servicio(repo);

    await expect(service.reservar(C, reserva())).rejects.toMatchObject({ status: 409 });
    expect(bus.publicar).not.toHaveBeenCalled();
  });

  describe('cancelación', () => {
    it('cancela antes del inicio y publica RESERVA_CANCELADA', async () => {
      const { service, repo, bus } = servicio();

      const cancelada = await service.cancelar(C, 'R');

      expect(repo.cambiarEstado).toHaveBeenCalledWith(
        { comensalId: C },
        'R',
        'PENDIENTE',
        'CANCELADA',
      );
      expect(bus.publicar).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'RESERVA_CANCELADA' }),
      );
      expect(cancelada).toMatchObject({ estado: 'CANCELADA', cancelable: false });
    });

    it('no cancela una reserva ajena (404)', async () => {
      const { service } = servicio(
        repoFalso({ buscarDelComensal: jest.fn().mockResolvedValue(null) }),
      );

      await expect(service.cancelar(C, 'R')).rejects.toMatchObject({ status: 404 });
    });

    it('no cancela una reserva ya empezada (409)', async () => {
      const { service, repo } = servicio(undefined, undefined, new Date(A_LAS_21));

      await expect(service.cancelar(C, 'R')).rejects.toMatchObject({ status: 409 });
      expect(repo.cambiarEstado).not.toHaveBeenCalled();
    });

    it('si cambiarEstado devuelve false responde 409', async () => {
      const { service, bus } = servicio(
        repoFalso({ cambiarEstado: jest.fn().mockResolvedValue(false) }),
      );

      await expect(service.cancelar(C, 'R')).rejects.toMatchObject({ status: 409 });
      expect(bus.publicar).not.toHaveBeenCalled();
    });
  });

  it('mis reservas marca como no cancelable una que ya empezó', async () => {
    const { service } = servicio(undefined, undefined, new Date(A_LAS_21));

    const [primera] = await service.misReservas(C);

    expect(primera).toMatchObject({ id: 'R', cancelable: false });
  });
});

describe('activación (CU-12)', () => {
  const R = 'restaurante';
  // 19:40 en Argentina: dentro de los 30 minutos previos a las 20:00.
  const DENTRO = new Date('2026-10-30T22:40:00.000Z');

  it('activa dentro de la ventana, abre la cuenta y publica RESERVA_ACTIVADA', async () => {
    const { service, repo, bus } = servicio(undefined, undefined, DENTRO);

    const activada = await service.activar(R, S, 'R');

    expect(repo.buscarEnSucursal).toHaveBeenCalledWith(R, S, 'R');
    expect(repo.activar).toHaveBeenCalledWith(R, S, 'R', 'PENDIENTE', 'ACTIVA');
    expect(bus.publicar).toHaveBeenCalledWith({
      tipo: 'RESERVA_ACTIVADA',
      reserva: expect.objectContaining({ id: 'R', estado: 'ACTIVA' }),
    });
    expect(activada).toMatchObject({ estado: 'ACTIVA', activable: false });
  });

  it('antes de los 30 minutos previos responde 409', async () => {
    const { service, repo } = servicio(undefined, undefined, new Date('2026-10-30T22:29:00.000Z'));

    await expect(service.activar(R, S, 'R')).rejects.toMatchObject({ status: 409 });
    expect(repo.activar).not.toHaveBeenCalled();
  });

  it('una reserva de otra sucursal o restaurante responde 404', async () => {
    const { service } = servicio(
      repoFalso({ buscarEnSucursal: jest.fn().mockResolvedValue(null) }),
      undefined,
      DENTRO,
    );

    await expect(service.activar(R, S, 'R')).rejects.toMatchObject({ status: 404 });
  });

  it('si otro la activó antes responde 409', async () => {
    const { service, bus } = servicio(
      repoFalso({ activar: jest.fn().mockResolvedValue(false) }),
      undefined,
      DENTRO,
    );

    await expect(service.activar(R, S, 'R')).rejects.toMatchObject({ status: 409 });
    expect(bus.publicar).not.toHaveBeenCalled();
  });

  it('activable refleja la ventana en el listado del día', async () => {
    const repo = repoFalso({
      listarDelDia: jest
        .fn()
        .mockResolvedValue([
          filaPanel(),
          filaPanel({ id: 'tarde', inicio: new Date('2026-10-31T00:00:00.000Z') }),
          filaPanel({ id: 'activa', estado: 'ACTIVA' }),
        ]),
    });
    const { service } = servicio(repo, undefined, DENTRO);

    const lista = await service.delDia(R, S, '2026-10-30');

    expect(repo.listarDelDia).toHaveBeenCalledWith(
      R,
      S,
      new Date('2026-10-30T03:00:00.000Z'),
      new Date('2026-10-31T03:00:00.000Z'),
    );
    expect(lista.map((r) => [r.id, r.activable])).toEqual([
      ['R', true],
      ['tarde', false],
      ['activa', false],
    ]);
    expect(lista[0]).toMatchObject({
      comensal: { nombre: 'Carlos', telefono: null },
      limiteLlegada: '2026-10-30T23:15:00.000Z',
    });
  });
});

describe('vencimiento por no-show (CU-21)', () => {
  it('vence las pendientes pasada la tolerancia y publica RESERVA_VENCIDA', async () => {
    const { service, repo, bus } = servicio(
      undefined,
      undefined,
      new Date('2026-10-30T23:15:01.000Z'),
    );

    expect(await service.vencerPendientes()).toBe(1);
    expect(repo.cambiarEstado).toHaveBeenCalledWith({ sistema: true }, 'R', 'PENDIENTE', 'VENCIDA');
    expect(bus.publicar).toHaveBeenCalledWith({
      tipo: 'RESERVA_VENCIDA',
      reserva: expect.objectContaining({ id: 'R', estado: 'VENCIDA' }),
    });
  });

  it('no vence dentro de la tolerancia', async () => {
    const { service, repo } = servicio(undefined, undefined, new Date('2026-10-30T23:15:00.000Z'));

    expect(await service.vencerPendientes()).toBe(0);
    expect(repo.cambiarEstado).not.toHaveBeenCalled();
  });

  it('no publica si otra operación ya la cambió', async () => {
    const { service, bus } = servicio(
      repoFalso({ cambiarEstado: jest.fn().mockResolvedValue(false) }),
      undefined,
      new Date('2026-10-30T23:20:00.000Z'),
    );

    expect(await service.vencerPendientes()).toBe(0);
    expect(bus.publicar).not.toHaveBeenCalled();
  });
});
