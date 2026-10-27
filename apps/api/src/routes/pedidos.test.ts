import request from 'supertest';
import { createApp } from '../app';
import { cookieConPermisos } from '../test/sesion-falsa';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

const PEDIDO = '01900000-0000-7000-8000-000000000081';

describe('/api/pedidos', () => {
  const app = createApp();

  it('sin pedido.ver no se ve la cola', async () => {
    await request(app)
      .get('/api/pedidos/cola')
      .set('Cookie', cookieConPermisos(['reserva.ver']))
      .expect(403);
  });

  it('cancelar sin motivo responde 400', async () => {
    await request(app)
      .post(`/api/pedidos/${PEDIDO}/cancelar`)
      .set('Cookie', cookieConPermisos(['pedido.ver', 'pedido.gestionar_cola']))
      .send({ motivo: '  ' })
      .expect(400);
  });
});
