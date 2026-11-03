import request from 'supertest';
import { createApp } from '../app';
import { firmarToken } from '../lib/jwt';
import { IDS } from '../test/fake-usuarios';
import { cookieConPermisos } from '../test/sesion-falsa';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

jest.mock('../services/salon.service', () => ({
  salonService: { estado: jest.fn().mockResolvedValue([]) },
}));

const { salonService } = jest.requireMock('../services/salon.service');

describe('GET /api/salon/estado', () => {
  const app = createApp();

  beforeEach(() => salonService.estado.mockClear());

  it('sin sesión responde 401', async () => {
    await request(app).get('/api/salon/estado').expect(401);
  });

  it('sin reserva.ver responde 403', async () => {
    await request(app)
      .get('/api/salon/estado')
      .set('Cookie', cookieConPermisos(['pedido.ver']))
      .expect(403);
  });

  it('sin sucursal de trabajo responde 409', async () => {
    cookieConPermisos(['reserva.ver']);
    const sinSucursal = `sesion=${firmarToken({ usuarioId: IDS.admin, sucursalId: null })}`;
    await request(app).get('/api/salon/estado').set('Cookie', sinSucursal).expect(409);
  });

  it('con reserva.ver y pedido.ver responde 200 y pide los pedidos', async () => {
    await request(app)
      .get('/api/salon/estado')
      .set('Cookie', cookieConPermisos(['reserva.ver', 'pedido.ver']))
      .expect(200);
    expect(salonService.estado).toHaveBeenCalledWith(IDS.restaurante, IDS.centro, true);
  });

  it('con reserva.ver solamente responde 200 y no pide los pedidos', async () => {
    await request(app)
      .get('/api/salon/estado')
      .set('Cookie', cookieConPermisos(['reserva.ver']))
      .expect(200);
    expect(salonService.estado).toHaveBeenCalledWith(IDS.restaurante, IDS.centro, false);
  });
});
