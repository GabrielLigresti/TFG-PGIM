import request from 'supertest';
import { createApp } from '../app';
import { cookieConPermisos } from '../test/sesion-falsa';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

const ID = '01900000-0000-7000-8000-000000000011';
const ruta = `/api/recetas/intermedio/${ID}/lleva-stock`;

describe('PUT /api/recetas/intermedio/:id/lleva-stock', () => {
  const app = createApp();

  it('sin receta.editar responde 403', async () => {
    const res = await request(app)
      .put(ruta)
      .set('Cookie', cookieConPermisos(['receta.ver', 'receta.crear']))
      .send({ llevaStock: true });

    expect(res.status).toBe(403);
  });

  it('con un cuerpo inválido responde 400', async () => {
    const res = await request(app)
      .put(ruta)
      .set('Cookie', cookieConPermisos(['receta.editar']))
      .send({ llevaStock: 'si' });

    expect(res.status).toBe(400);
  });

  it('con un id mal formado responde 400', async () => {
    const res = await request(app)
      .put('/api/recetas/intermedio/no-es-uuid/lleva-stock')
      .set('Cookie', cookieConPermisos(['receta.editar']))
      .send({ llevaStock: true });

    expect(res.status).toBe(400);
  });
});
