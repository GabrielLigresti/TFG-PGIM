import request from 'supertest';
import { createApp } from '../app';
import { cookieConPermisos } from '../test/sesion-falsa';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

jest.mock('../repositories/alerta.repository', () => ({
  alertaRepository: {
    crearSiNoHay: jest.fn(),
    listarSinResolver: jest.fn().mockResolvedValue([]),
    resolver: jest.fn().mockResolvedValue(false),
  },
}));

const ALERTA = '01900000-0000-7000-8000-000000000091';

describe('/api/alertas', () => {
  const app = createApp();

  it('sin stock.registrar responde 403', async () => {
    await request(app)
      .get('/api/alertas')
      .set('Cookie', cookieConPermisos(['pedido.ver']))
      .expect(403);
  });

  it('con stock.registrar lista las alertas', async () => {
    await request(app)
      .get('/api/alertas')
      .set('Cookie', cookieConPermisos(['stock.registrar']))
      .expect(200, []);
  });

  it('resolver una alerta de otra sucursal responde 404', async () => {
    await request(app)
      .post(`/api/alertas/${ALERTA}/resolver`)
      .set('Cookie', cookieConPermisos(['stock.registrar']))
      .expect(404);
  });
});
