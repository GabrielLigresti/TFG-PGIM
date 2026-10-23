import request from 'supertest';
import { createApp } from '../app';
import { IDS } from '../test/fake-usuarios';
import { cookieConPermisos } from '../test/sesion-falsa';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

jest.mock('../repositories/mesa.repository', () => ({
  mesaRepository: {
    listar: jest.fn().mockResolvedValue([]),
    existeSucursal: jest.fn().mockResolvedValue(true),
    buscar: jest.fn().mockResolvedValue(null),
    existeNumero: jest.fn().mockResolvedValue(false),
    crear: jest.fn(),
    actualizar: jest.fn(),
    desactivar: jest.fn(),
  },
}));

const URL = `/api/sucursales/${IDS.centro}/mesas`;
const valida = { numero: 1, capacidad: 4, posX: 10, posY: 10 };

describe('/api/sucursales/:sucursalId/mesas', () => {
  const app = createApp();

  it('sin cookie responde 401', async () => {
    expect((await request(app).get(URL)).status).toBe(401);
  });

  it('sin sucursal.ver responde 403', async () => {
    const res = await request(app)
      .get(URL)
      .set('Cookie', cookieConPermisos(['menu.ver']));
    expect(res.status).toBe(403);
  });

  it('con sucursal.ver lista el salón', async () => {
    const res = await request(app)
      .get(URL)
      .set('Cookie', cookieConPermisos(['sucursal.ver']));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('crear sin sucursal.editar responde 403', async () => {
    const res = await request(app)
      .post(URL)
      .set('Cookie', cookieConPermisos(['sucursal.ver']))
      .send(valida);
    expect(res.status).toBe(403);
  });

  it('rechaza una capacidad de 0', async () => {
    const res = await request(app)
      .post(URL)
      .set('Cookie', cookieConPermisos(['sucursal.editar']))
      .send({ ...valida, capacidad: 0 });
    expect(res.status).toBe(400);
  });

  it('rechaza una posición fuera del lienzo', async () => {
    const res = await request(app)
      .post(URL)
      .set('Cookie', cookieConPermisos(['sucursal.editar']))
      .send({ ...valida, posX: 101 });
    expect(res.status).toBe(400);
  });

  it('valida el id de la sucursal', async () => {
    const res = await request(app)
      .get('/api/sucursales/no-es-uuid/mesas')
      .set('Cookie', cookieConPermisos(['sucursal.ver']));
    expect(res.status).toBe(400);
  });
});
