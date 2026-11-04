import request from 'supertest';
import { createApp } from '../app';
import { cookieConPermisos } from '../test/sesion-falsa';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));
jest.mock('../repositories/metrica.repository', () => ({
  metricaRepository: {
    sucursalesActivas: jest.fn().mockResolvedValue([]),
    pagosAprobados: jest.fn().mockResolvedValue([]),
    lineasEntregadas: jest.fn().mockResolvedValue([]),
    costosDePlatos: jest.fn().mockResolvedValue(new Map()),
    mermaPorMotivo: jest.fn().mockResolvedValue([]),
    datosDeOcupacion: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../repositories/apertura.repository', () => ({
  aperturaRepository: {
    obtenerConfiguracion: jest.fn().mockResolvedValue(null),
    pronosticosDeSemana: jest.fn().mockResolvedValue([]),
    historial: jest.fn(),
  },
}));

describe('/api/metricas', () => {
  const app = createApp();

  it('sin sesión responde 401', async () => {
    await request(app).get('/api/metricas').expect(401);
  });

  it('sin metrica.ver responde 403', async () => {
    await request(app)
      .get('/api/metricas')
      .set('Cookie', cookieConPermisos(['pedido.ver']))
      .expect(403);
  });

  it('con metrica.ver responde las métricas de la sucursal asignada', async () => {
    const res = await request(app)
      .get('/api/metricas')
      .set('Cookie', cookieConPermisos(['metrica.ver']))
      .expect(200);
    expect(res.body.alcance.sucursales).toHaveLength(1);
    expect(res.body.ventas).toEqual({ total: 0, porDia: [] });
  });

  it('un período invertido responde 400', async () => {
    await request(app)
      .get('/api/metricas?desde=2026-10-10&hasta=2026-10-01')
      .set('Cookie', cookieConPermisos(['metrica.ver']))
      .expect(400);
  });

  it('una sucursal fuera del alcance responde 403', async () => {
    await request(app)
      .get('/api/metricas?sucursalId=0190b4b0-0000-7000-8000-0000000000ff')
      .set('Cookie', cookieConPermisos(['metrica.ver']))
      .expect(403);
  });
});
