import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { createApp } from '../app';
import { firmarToken } from '../lib/jwt';
import { autenticar, requierePermiso, tenant } from '../middleware/auth';
import { errorHandler } from '../middleware/error-handler';
import { IDS, PASSWORD, crearRepositorioFalso } from '../test/fake-usuarios';

jest.mock('../repositories/usuario.repository', () => {
  const repo = {
    findCredencialesByEmail: jest.fn(),
    findSesionById: jest.fn(),
    crearComensal: jest.fn(),
  };
  return { usuarioRepository: repo };
});

beforeAll(async () => {
  const { usuarioRepository } = jest.requireMock('../repositories/usuario.repository');
  const falso = await crearRepositorioFalso();
  usuarioRepository.findCredencialesByEmail.mockImplementation(falso.findCredencialesByEmail);
  usuarioRepository.findSesionById.mockImplementation(falso.findSesionById);
  usuarioRepository.crearComensal.mockImplementation(falso.crearComensal);
});

function cookieDe(usuarioId: string, sucursalId: string | null = IDS.centro): string {
  return `sesion=${firmarToken({ usuarioId, sucursalId })}`;
}

describe('POST /api/auth/login', () => {
  it('setea la cookie de sesión httpOnly y devuelve la sesión', async () => {
    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'MOZO@demo.test ', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.usuario.email).toBe('mozo@demo.test');
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^sesion=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).not.toMatch(/Secure/);
  });

  it('marca la cookie como Secure cuando llega por HTTPS (túnel)', async () => {
    const res = await request(createApp())
      .post('/api/auth/login')
      .set('X-Forwarded-Proto', 'https')
      .send({ email: 'mozo@demo.test', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(String(res.headers['set-cookie'])).toMatch(/Secure/);
  });

  it('responde 401 con mensaje genérico ante credenciales incorrectas', async () => {
    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'mozo@demo.test', password: 'otra' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Email o contraseña incorrectos' });
  });

  it('responde 400 si faltan datos', async () => {
    const res = await request(createApp()).post('/api/auth/login').send({ email: 'x' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/sesion', () => {
  it('sin cookie responde 401', async () => {
    const res = await request(createApp()).get('/api/auth/sesion');

    expect(res.status).toBe(401);
  });

  it('con cookie válida devuelve la sesión', async () => {
    const res = await request(createApp())
      .get('/api/auth/sesion')
      .set('Cookie', cookieDe(IDS.mozo));

    expect(res.status).toBe(200);
    expect(res.body.sucursalActiva.id).toBe(IDS.centro);
  });

  it('con un usuario dado de baja responde 401', async () => {
    const res = await request(createApp())
      .get('/api/auth/sesion')
      .set('Cookie', cookieDe(IDS.inactivo));

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/sucursal', () => {
  it('cambia la sucursal activa y renueva la cookie', async () => {
    const res = await request(createApp())
      .post('/api/auth/sucursal')
      .set('Cookie', cookieDe(IDS.admin, null))
      .send({ sucursalId: IDS.palermo });

    expect(res.status).toBe(200);
    expect(res.body.sucursalActiva.id).toBe(IDS.palermo);
    expect(String(res.headers['set-cookie'])).toMatch(/^sesion=/);
  });
});

describe('POST /api/auth/logout', () => {
  it('borra la cookie', async () => {
    const res = await request(createApp()).post('/api/auth/logout');

    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toMatch(/sesion=;.*Expires=Thu, 01 Jan 1970/);
  });
});

describe('cadena autenticar → tenant → requierePermiso', () => {
  const app = express();
  app.use(cookieParser());
  app.get('/ver', autenticar, tenant, requierePermiso('sucursal.ver'), (req, res) => {
    res.json(req.tenant);
  });
  app.get('/crear', autenticar, tenant, requierePermiso('sucursal.crear'), (_req, res) => {
    res.end();
  });
  app.use(errorHandler);

  it('con el permiso pasa y deja el tenant en el request', async () => {
    const res = await request(app).get('/ver').set('Cookie', cookieDe(IDS.mozo));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ restauranteId: IDS.restaurante, sucursalId: IDS.centro });
  });

  it('sin el permiso responde 403', async () => {
    const res = await request(app).get('/crear').set('Cookie', cookieDe(IDS.mozo));

    expect(res.status).toBe(403);
  });

  it('un comensal no pasa el middleware de tenant', async () => {
    const res = await request(app).get('/ver').set('Cookie', cookieDe(IDS.comensal, null));

    expect(res.status).toBe(403);
  });
});

describe('POST /api/auth/registro', () => {
  const valido = { nombre: 'Nueva', email: 'nueva@demo.test', password: 'clave1234' };

  it('rechaza una contraseña de menos de 8 caracteres', async () => {
    const res = await request(createApp())
      .post('/api/auth/registro')
      .send({ ...valido, password: 'clave12' });
    expect(res.status).toBe(400);
  });

  it('rechaza un email inválido', async () => {
    const res = await request(createApp())
      .post('/api/auth/registro')
      .send({ ...valido, email: 'no-es-email' });
    expect(res.status).toBe(400);
  });

  it('crea la cuenta, deja la sesión iniciada y responde 201', async () => {
    const res = await request(createApp()).post('/api/auth/registro').send(valido);

    expect(res.status).toBe(201);
    expect(res.headers['set-cookie']?.[0]).toContain('sesion=');
    expect(res.body.usuario.tipo).toBe('COMENSAL');
  });
});
