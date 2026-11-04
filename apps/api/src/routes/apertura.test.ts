import request from 'supertest';
import { createApp } from '../app';
import { firmarToken } from '../lib/jwt';
import { cookieConPermisos } from '../test/sesion-falsa';
import { IDS } from '../test/fake-usuarios';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

const CONFIG = { semanasHistoricoMinimo: 8, cubiertosPorMozo: 20, platosPorCocineroHora: 12 };

jest.mock('../repositories/apertura.repository', () => ({
  aperturaRepository: {
    obtenerConfiguracion: jest.fn(),
    actualizarConfiguracion: jest.fn(),
    historial: jest.fn(),
    pronosticosDeSemana: jest.fn(),
  },
}));

jest.mock('../repositories/planificacion.repository', () => ({
  planificacionRepository: {
    planificar: jest.fn(),
    reemplazarYPlanificar: jest.fn(),
    confirmar: jest.fn(),
    confirmarSemana: jest.fn(),
    deSemana: jest.fn(),
    contexto: jest.fn(),
  },
}));

const repo = jest.requireMock('../repositories/apertura.repository').aperturaRepository;
const planRepo = jest.requireMock(
  '../repositories/planificacion.repository',
).planificacionRepository;
const ID = '0190b4b0-0000-7000-8000-000000000001';

describe('/api/apertura', () => {
  const app = createApp();
  const cookie = () => cookieConPermisos(['apertura.consultar']);

  beforeEach(() => {
    jest.clearAllMocks();
    repo.obtenerConfiguracion.mockResolvedValue(CONFIG);
    repo.actualizarConfiguracion.mockResolvedValue(CONFIG);
    repo.historial.mockResolvedValue({ reservas: [], horarios: [], items: [] });
  });

  it('sin sesión responde 401', async () => {
    await request(app).get('/api/apertura/pronostico').expect(401);
  });

  it('sin apertura.consultar responde 403', async () => {
    await request(app)
      .get('/api/apertura/configuracion')
      .set('Cookie', cookieConPermisos(['pedido.ver']))
      .expect(403);
  });

  it('sin sucursal de trabajo responde 409', async () => {
    cookieConPermisos(['apertura.consultar']);
    const sinSucursal = `sesion=${firmarToken({ usuarioId: IDS.admin, sucursalId: null })}`;
    await request(app).get('/api/apertura/configuracion').set('Cookie', sinSucursal).expect(409);
  });

  it('GET /pronostico con poco historial devuelve el progreso', async () => {
    const res = await request(app)
      .get('/api/apertura/pronostico')
      .set('Cookie', cookie())
      .expect(200);
    expect(res.body.progreso).toMatchObject({ semanas: 0, minimo: 8, suficiente: false });
    expect(res.body.pronosticos).toEqual([]);
    expect(res.body.planificacion).toBeNull();
    expect(planRepo.planificar).not.toHaveBeenCalled();
  });

  it('POST /pronostico/regenerar con poco historial no escribe', async () => {
    await request(app)
      .post('/api/apertura/pronostico/regenerar')
      .set('Cookie', cookieConPermisos(['turno.planificar']))
      .expect(200);
    expect(planRepo.reemplazarYPlanificar).not.toHaveBeenCalled();
  });

  it('regenerar pide turno.planificar: apertura.consultar no alcanza', async () => {
    await request(app)
      .post('/api/apertura/pronostico/regenerar')
      .set('Cookie', cookie())
      .expect(403);
    expect(planRepo.reemplazarYPlanificar).not.toHaveBeenCalled();
  });

  it('GET /pronostico sigue pidiendo apertura.consultar', async () => {
    await request(app)
      .get('/api/apertura/pronostico')
      .set('Cookie', cookieConPermisos(['turno.planificar']))
      .expect(403);
  });

  it('confirmar pide turno.planificar', async () => {
    await request(app)
      .post(`/api/apertura/planificacion/${ID}/confirmar`)
      .set('Cookie', cookie())
      .expect(403);
    expect(planRepo.confirmarSemana).not.toHaveBeenCalled();
  });

  it('confirmar con un id que no es uuid responde 400', async () => {
    await request(app)
      .post('/api/apertura/planificacion/abc/confirmar')
      .set('Cookie', cookieConPermisos(['turno.planificar']))
      .expect(400);
    expect(planRepo.confirmarSemana).not.toHaveBeenCalled();
  });

  it('confirmar devuelve la planificación confirmada de la sucursal de trabajo', async () => {
    planRepo.confirmarSemana.mockResolvedValue('2026-11-09');
    planRepo.deSemana.mockResolvedValue({ id: ID, estado: 'CONFIRMADA' });
    const res = await request(app)
      .post(`/api/apertura/planificacion/${ID}/confirmar`)
      .set('Cookie', cookieConPermisos(['turno.planificar']))
      .expect(200);
    expect(res.body).toMatchObject({ id: ID, estado: 'CONFIRMADA' });
    expect(planRepo.confirmarSemana).toHaveBeenCalledWith(
      { restauranteId: IDS.restaurante, sucursalId: IDS.centro },
      ID,
      expect.any(Date),
    );
  });

  it('GET /configuracion devuelve la configuración', async () => {
    await request(app)
      .get('/api/apertura/configuracion')
      .set('Cookie', cookie())
      .expect(200, CONFIG);
    expect(repo.obtenerConfiguracion).toHaveBeenCalledWith(IDS.restaurante, IDS.centro, undefined);
  });

  it('PUT /configuracion inválida responde 400', async () => {
    await request(app)
      .put('/api/apertura/configuracion')
      .set('Cookie', cookie())
      .send({ ...CONFIG, semanasHistoricoMinimo: 2 })
      .expect(400);
    expect(repo.actualizarConfiguracion).not.toHaveBeenCalled();
  });

  it('PUT /configuracion válida guarda y devuelve', async () => {
    const nueva = { ...CONFIG, cubiertosPorMozo: 25 };
    repo.actualizarConfiguracion.mockResolvedValue(nueva);
    await request(app)
      .put('/api/apertura/configuracion')
      .set('Cookie', cookie())
      .send(nueva)
      .expect(200, nueva);
    expect(repo.actualizarConfiguracion).toHaveBeenCalledWith(IDS.restaurante, IDS.centro, nueva);
  });

  it('sin configuración responde 404', async () => {
    repo.obtenerConfiguracion.mockResolvedValue(null);
    await request(app).get('/api/apertura/configuracion').set('Cookie', cookie()).expect(404);
  });
});
