import request from 'supertest';
import { createApp } from '../app';
import { cookieConPermisos, cookieDeComensal } from '../test/sesion-falsa';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

jest.mock('../repositories/comensal.repository', () => ({
  comensalRepository: {
    listarSucursales: jest.fn().mockResolvedValue([]),
    buscarSucursalConMenu: jest.fn().mockResolvedValue(null),
  },
}));

const ID = '01900000-0000-7000-8000-000000000011';

describe('/api/comensal', () => {
  const app = createApp();

  it('sin cookie responde 401', async () => {
    expect((await request(app).get('/api/comensal/sucursales')).status).toBe(401);
  });

  it('un empleado no entra (403)', async () => {
    const res = await request(app)
      .get('/api/comensal/sucursales')
      .set('Cookie', cookieConPermisos(['menu.ver']));

    expect(res.status).toBe(403);
  });

  it('un comensal lista las sucursales', async () => {
    const res = await request(app)
      .get('/api/comensal/sucursales')
      .set('Cookie', cookieDeComensal());

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('valida los ids de la URL', async () => {
    const res = await request(app)
      .get('/api/comensal/sucursales/no-es-uuid/menu')
      .set('Cookie', cookieDeComensal());

    expect(res.status).toBe(400);
  });

  it('una sucursal que no existe responde 404', async () => {
    const res = await request(app)
      .get(`/api/comensal/sucursales/${ID}/platos/${ID}`)
      .set('Cookie', cookieDeComensal());

    expect(res.status).toBe(404);
  });
});
