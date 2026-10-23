import request from 'supertest';
import { createApp } from '../app';
import { fechaDe, iniciosDelDia, sumarDias } from '../domain/franjas';
import { IDS } from '../test/fake-usuarios';
import { cookieConPermisos, cookieDeComensal } from '../test/sesion-falsa';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

jest.mock('../repositories/reserva.repository', () => ({
  reservaRepository: {
    buscarSucursalReservable: jest.fn(),
    listarMesasActivas: jest.fn(),
    mesasOcupadas: jest.fn().mockResolvedValue([]),
    comensalTieneReservaEn: jest.fn().mockResolvedValue(false),
    crear: jest.fn(),
    buscarDelComensal: jest.fn(),
    listarDelComensal: jest.fn().mockResolvedValue([]),
    cambiarEstado: jest.fn(),
    listarDelDia: jest.fn().mockResolvedValue([]),
    buscarEnSucursal: jest.fn(),
    activar: jest.fn().mockResolvedValue(true),
  },
}));

const MESA = '01900000-0000-7000-8000-000000000041';
const RESERVA = '01900000-0000-7000-8000-000000000051';

// Las 20:00 de mañana: el test no depende de la fecha en que corre.
const manana = sumarDias(fechaDe(new Date()), 1);
const inicio = iniciosDelDia(manana, '12:00', '00:00')[8]!;

describe('/api/comensal (reservas)', () => {
  const app = createApp();
  const { reservaRepository } = jest.requireMock('../repositories/reserva.repository');

  beforeEach(() => {
    reservaRepository.buscarSucursalReservable.mockResolvedValue({
      id: IDS.centro,
      nombre: 'Centro',
      restauranteId: IDS.restaurante,
      horarioApertura: '12:00',
      horarioCierre: '00:00',
      toleranciaNoShowMin: 15,
    });
    reservaRepository.listarMesasActivas.mockResolvedValue([
      { id: MESA, numero: 1, capacidad: 4, posX: 10, posY: 15, activa: true },
    ]);
    reservaRepository.crear.mockImplementation(async (d: Record<string, unknown>) => ({
      ...d,
      id: RESERVA,
      sucursalNombre: 'Centro',
      mesaNumero: 1,
      estado: 'PENDIENTE',
      toleranciaNoShowMin: 15,
    }));
  });

  it('sin cookie responde 401', async () => {
    expect((await request(app).get('/api/comensal/reservas')).status).toBe(401);
  });

  it('un empleado no entra (403)', async () => {
    const res = await request(app)
      .get('/api/comensal/reservas')
      .set('Cookie', cookieConPermisos(['reserva.ver']));
    expect(res.status).toBe(403);
  });

  it('valida el formato de la fecha', async () => {
    const res = await request(app)
      .get(`/api/comensal/sucursales/${IDS.centro}/franjas?fecha=30-10-2026&personas=2`)
      .set('Cookie', cookieDeComensal());
    expect(res.status).toBe(400);
  });

  it('valida la cantidad de personas', async () => {
    const res = await request(app)
      .get(`/api/comensal/sucursales/${IDS.centro}/franjas?fecha=${manana}&personas=0`)
      .set('Cookie', cookieDeComensal());
    expect(res.status).toBe(400);
  });

  it('lista las franjas de mañana', async () => {
    const res = await request(app)
      .get(`/api/comensal/sucursales/${IDS.centro}/franjas?fecha=${manana}&personas=2`)
      .set('Cookie', cookieDeComensal());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(12);
  });

  it('valida el cuerpo de la reserva', async () => {
    const res = await request(app)
      .post('/api/comensal/reservas')
      .set('Cookie', cookieDeComensal())
      .send({ sucursalId: 'x' });
    expect(res.status).toBe(400);
  });

  it('un comensal reserva con datos válidos (201)', async () => {
    const res = await request(app)
      .post('/api/comensal/reservas')
      .set('Cookie', cookieDeComensal())
      .send({ sucursalId: IDS.centro, inicio: inicio.toISOString(), personas: 2, mesaId: MESA });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: RESERVA, mesa: { numero: 1 }, estado: 'PENDIENTE' });
    expect(reservaRepository.crear).toHaveBeenCalledWith(
      expect.objectContaining({ comensalId: IDS.comensal }),
    );
  });

  it('valida el id al cancelar', async () => {
    const res = await request(app)
      .post('/api/comensal/reservas/no-es-uuid/cancelar')
      .set('Cookie', cookieDeComensal());
    expect(res.status).toBe(400);
  });
});

describe('/api/reservas (panel)', () => {
  const app = createApp();
  const { reservaRepository } = jest.requireMock('../repositories/reserva.repository');

  it('sin reserva.ver responde 403', async () => {
    const res = await request(app)
      .get('/api/reservas?fecha=2026-10-30')
      .set('Cookie', cookieConPermisos(['menu.ver']));
    expect(res.status).toBe(403);
  });

  it('con reserva.ver lista las reservas del día de la sucursal de trabajo', async () => {
    const res = await request(app)
      .get('/api/reservas?fecha=2026-10-30')
      .set('Cookie', cookieConPermisos(['reserva.ver']));
    expect(res.status).toBe(200);
    expect(reservaRepository.listarDelDia).toHaveBeenCalledWith(
      IDS.restaurante,
      IDS.centro,
      new Date('2026-10-30T03:00:00.000Z'),
      new Date('2026-10-31T03:00:00.000Z'),
    );
  });

  it('valida la fecha', async () => {
    const res = await request(app)
      .get('/api/reservas?fecha=hoy')
      .set('Cookie', cookieConPermisos(['reserva.ver']));
    expect(res.status).toBe(400);
  });

  it('activar sin reserva.activar responde 403', async () => {
    const res = await request(app)
      .post(`/api/reservas/${RESERVA}/activar`)
      .set('Cookie', cookieConPermisos(['reserva.ver']));
    expect(res.status).toBe(403);
  });

  it('con reserva.activar activa una reserva dentro de la ventana', async () => {
    // Empieza en 10 minutos: el test no depende de la hora en que corre.
    reservaRepository.buscarEnSucursal.mockResolvedValue({
      id: RESERVA,
      sucursalId: IDS.centro,
      sucursalNombre: 'Centro',
      comensalId: IDS.comensal,
      mesaId: MESA,
      mesaNumero: 1,
      inicio: new Date(Date.now() + 10 * 60 * 1000),
      cantidadPersonas: 2,
      modoAsignacion: 'MANUAL',
      estado: 'PENDIENTE',
      toleranciaNoShowMin: 15,
      comensalNombre: 'Carlos',
      comensalTelefono: null,
    });

    const res = await request(app)
      .post(`/api/reservas/${RESERVA}/activar`)
      .set('Cookie', cookieConPermisos(['reserva.activar']));

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('ACTIVA');
    expect(reservaRepository.buscarEnSucursal).toHaveBeenCalledWith(
      IDS.restaurante,
      IDS.centro,
      RESERVA,
    );
  });
});
