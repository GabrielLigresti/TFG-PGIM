import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

// La carpeta de uploads se fija antes de cargar la configuración: por eso la
// app y la sesión falsa se cargan con require, después de esta línea.
const UPLOADS = mkdtempSync(path.join(tmpdir(), 'pgim-uploads-'));
process.env.UPLOADS_DIR = UPLOADS;
const { createApp } = require('../app') as typeof import('../app');
const { cookieConPermisos } =
  require('../test/sesion-falsa') as typeof import('../test/sesion-falsa');

const ID = '01900000-0000-7000-8000-000000000011';

describe('modelos RA servidos como estáticos', () => {
  const app = createApp();

  beforeAll(() => {
    const carpeta = path.join(UPLOADS, 'modelos');
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(path.join(carpeta, 'abc.glb'), 'glTF');
  });

  it('se descargan sin sesión, con tipo fijo y nosniff', async () => {
    const res = await request(app).get('/api/uploads/modelos/abc.glb');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('model/gltf-binary');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('no se lista la carpeta', async () => {
    expect((await request(app).get('/api/uploads/modelos/')).status).toBe(404);
  });

  it('no se sale de la carpeta', async () => {
    const res = await request(app).get('/api/uploads/modelos/..%2F..%2Fpackage.json');
    expect(res.status).not.toBe(200);
  });
});

describe('PUT /api/platos/:id/modelo-ra/:formato', () => {
  const app = createApp();

  it('sin cookie responde 401', async () => {
    const res = await request(app)
      .put(`/api/platos/${ID}/modelo-ra/glb`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('glTF'));

    expect(res.status).toBe(401);
  });

  it('sin menu.editar responde 403', async () => {
    const res = await request(app)
      .put(`/api/platos/${ID}/modelo-ra/glb`)
      .set('Cookie', cookieConPermisos(['menu.ver']))
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('glTF'));

    expect(res.status).toBe(403);
  });

  it('rechaza un formato que no es glb ni usdz', async () => {
    const res = await request(app)
      .put(`/api/platos/${ID}/modelo-ra/html`)
      .set('Cookie', cookieConPermisos(['menu.editar']))
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('<html>'));

    expect(res.status).toBe(400);
  });

  it('responde 413 si el archivo supera el límite', async () => {
    const res = await request(app)
      .put(`/api/platos/${ID}/modelo-ra/glb?escalaReal=1&porcionGramos=100`)
      .set('Cookie', cookieConPermisos(['menu.editar']))
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.alloc(21 * 1024 * 1024));

    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/demasiado grande/);
  });
});
