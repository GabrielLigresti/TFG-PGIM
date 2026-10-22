import request from 'supertest';
import type { CodigoPermiso } from '@pgim/shared';
import { createApp } from '../app';
import { cookieConPermisos } from '../test/sesion-falsa';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

// Casos que se resuelven en la cadena de middleware, antes de llegar a la base.
const ABM: { ruta: string; modulo: string }[] = [
  { ruta: '/api/sucursales', modulo: 'sucursal' },
  { ruta: '/api/roles', modulo: 'rol' },
  { ruta: '/api/personal', modulo: 'personal' },
  { ruta: '/api/insumos', modulo: 'insumo' },
  { ruta: '/api/categorias', modulo: 'menu' },
  { ruta: '/api/platos', modulo: 'menu' },
  { ruta: '/api/menus', modulo: 'menu' },
];

const ID = '01900000-0000-7000-8000-000000000011';

describe.each(ABM)('$ruta', ({ ruta, modulo }) => {
  const permiso = (accion: string) => `${modulo}.${accion}` as CodigoPermiso;
  const app = createApp();

  it('sin cookie responde 401', async () => {
    const res = await request(app).get(ruta);

    expect(res.status).toBe(401);
  });

  it('sin el permiso de lectura responde 403', async () => {
    const res = await request(app).get(ruta).set('Cookie', cookieConPermisos([]));

    expect(res.status).toBe(403);
  });

  it('dar de alta sin permiso de alta responde 403 aunque pueda ver', async () => {
    const res = await request(app)
      .post(ruta)
      .set('Cookie', cookieConPermisos([permiso('ver')]))
      .send({});

    expect(res.status).toBe(403);
  });

  it('con datos inválidos responde 400', async () => {
    const res = await request(app)
      .post(ruta)
      .set('Cookie', cookieConPermisos([permiso('crear')]))
      .send({ nombre: '' });

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('con un id mal formado responde 400', async () => {
    const res = await request(app)
      .delete(`${ruta}/no-es-uuid`)
      .set('Cookie', cookieConPermisos([permiso('eliminar')]));

    expect(res.status).toBe(400);
  });

  it('dar de baja sin permiso responde 403', async () => {
    const res = await request(app)
      .delete(`${ruta}/${ID}`)
      .set('Cookie', cookieConPermisos([permiso('ver'), permiso('editar')]));

    expect(res.status).toBe(403);
  });
});

describe('/api/recetas', () => {
  const app = createApp();

  it('sin receta.ver responde 403', async () => {
    const res = await request(app)
      .get('/api/recetas')
      .set('Cookie', cookieConPermisos(['insumo.ver']));

    expect(res.status).toBe(403);
  });

  it('crear un intermedio pide receta.crear', async () => {
    const res = await request(app)
      .post('/api/recetas/intermedios')
      .set('Cookie', cookieConPermisos(['receta.ver', 'receta.editar']))
      .send({});

    expect(res.status).toBe(403);
  });

  it('guardar una receta con datos inválidos responde 400', async () => {
    const res = await request(app)
      .put(`/api/recetas/plato/${ID}`)
      .set('Cookie', cookieConPermisos(['receta.crear']))
      .send({ lineas: 'no' });

    expect(res.status).toBe(400);
  });
});
