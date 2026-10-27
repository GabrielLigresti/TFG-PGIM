import request from 'supertest';
import { createApp } from '../app';
import { cookieConPermisos } from '../test/sesion-falsa';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

jest.mock('../repositories/pedido.repository', () => ({
  ...jest.requireActual('../repositories/pedido.repository'),
  pedidoRepository: {
    cola: jest.fn().mockResolvedValue([]),
    buscarEnSucursal: jest.fn(),
    cambiarEstado: jest.fn().mockResolvedValue({ listoEn: null }),
    cancelar: jest.fn().mockResolvedValue(true),
  },
}));

const PEDIDO = '01900000-0000-7000-8000-000000000081';
const MOZO = ['pedido.ver', 'pedido.avanzar'] as const;
const COCINERO = ['pedido.ver', 'pedido.gestionar_cola'] as const;

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

  const { pedidoRepository } = jest.requireMock('../repositories/pedido.repository');
  const conEstado = (estado: string | null) =>
    pedidoRepository.buscarEnSucursal.mockResolvedValue(
      estado && { id: PEDIDO, estado, comensalId: 'C' },
    );

  it('avanzar sin el estado que se vio responde 400', async () => {
    await request(app)
      .post(`/api/pedidos/${PEDIDO}/avanzar`)
      .set('Cookie', cookieConPermisos([...COCINERO]))
      .send({})
      .expect(400);
  });

  it('el mozo no puede empezar un pedido', async () => {
    conEstado('CONFIRMADO');
    await request(app)
      .post(`/api/pedidos/${PEDIDO}/avanzar`)
      .set('Cookie', cookieConPermisos([...MOZO]))
      .send({ desde: 'CONFIRMADO' })
      .expect(403);
  });

  it('el mozo no puede cancelar un pedido', async () => {
    conEstado('CONFIRMADO');
    await request(app)
      .post(`/api/pedidos/${PEDIDO}/cancelar`)
      .set('Cookie', cookieConPermisos([...MOZO]))
      .send({ motivo: 'Sin stock' })
      .expect(403);
  });

  it('el cocinero no puede entregar', async () => {
    conEstado('LISTO');
    await request(app)
      .post(`/api/pedidos/${PEDIDO}/avanzar`)
      .set('Cookie', cookieConPermisos([...COCINERO]))
      .send({ desde: 'LISTO' })
      .expect(403);
  });

  it('el mozo entrega un pedido listo', async () => {
    conEstado('LISTO');
    const res = await request(app)
      .post(`/api/pedidos/${PEDIDO}/avanzar`)
      .set('Cookie', cookieConPermisos([...MOZO]))
      .send({ desde: 'LISTO' })
      .expect(200);
    expect(res.body.estado).toBe('ENTREGADO');
  });

  it('un pedido de otra sucursal responde 404', async () => {
    conEstado(null);
    await request(app)
      .post(`/api/pedidos/${PEDIDO}/avanzar`)
      .set('Cookie', cookieConPermisos([...COCINERO]))
      .send({ desde: 'CONFIRMADO' })
      .expect(404);
  });
});
