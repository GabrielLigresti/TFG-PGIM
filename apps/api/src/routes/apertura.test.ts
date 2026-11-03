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
    generarSiFalta: jest.fn(),
    reemplazarSemana: jest.fn(),
  },
}));

const repo = jest.requireMock('../repositories/apertura.repository').aperturaRepository;

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
    expect(repo.generarSiFalta).not.toHaveBeenCalled();
  });

  it('POST /pronostico/regenerar con poco historial no escribe', async () => {
    await request(app)
      .post('/api/apertura/pronostico/regenerar')
      .set('Cookie', cookie())
      .expect(200);
    expect(repo.reemplazarSemana).not.toHaveBeenCalled();
  });

  it('GET /configuracion devuelve la configuración', async () => {
    await request(app)
      .get('/api/apertura/configuracion')
      .set('Cookie', cookie())
      .expect(200, CONFIG);
    expect(repo.obtenerConfiguracion).toHaveBeenCalledWith(IDS.restaurante, IDS.centro);
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
