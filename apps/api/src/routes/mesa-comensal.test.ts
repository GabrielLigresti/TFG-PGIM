import request from 'supertest';
import { createApp } from '../app';
import { cookieConPermisos, cookieDeComensal } from '../test/sesion-falsa';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

const CUENTA = '01900000-0000-7000-8000-000000000061';
const PLATO = '01900000-0000-7000-8000-000000000071';

describe('/api/comensal/pedidos', () => {
  const app = createApp();
  const pedido = {
    cuentaMesaId: CUENTA,
    lineas: [{ itemMenuId: PLATO, cantidad: 1, observaciones: null }],
  };

  it('sin cookie responde 401', async () => {
    await request(app).post('/api/comensal/pedidos').send(pedido).expect(401);
  });

  it('el personal no puede pedir como comensal', async () => {
    await request(app)
      .post('/api/comensal/pedidos')
      .set('Cookie', cookieConPermisos(['pedido.ver']))
      .send(pedido)
      .expect(403);
  });

  it('una cantidad de 0 responde 400', async () => {
    await request(app)
      .post('/api/comensal/pedidos')
      .set('Cookie', cookieDeComensal())
      .send({ ...pedido, lineas: [{ itemMenuId: PLATO, cantidad: 0, observaciones: null }] })
      .expect(400);
  });
});
