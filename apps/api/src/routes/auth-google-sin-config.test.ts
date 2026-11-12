import request from 'supertest';
import { createApp } from '../app';

jest.mock('../repositories/usuario.repository', () => ({ usuarioRepository: {} }));
jest.mock('../lib/google', () => ({ verificadorGoogle: null }));

describe('POST /api/auth/google sin verificador configurado', () => {
  it('responde 503', async () => {
    const res = await request(createApp()).post('/api/auth/google').send({ credential: 'tok' });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'El ingreso con Google no está disponible' });
  });
});
