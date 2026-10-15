import request from 'supertest';
import { healthResponseSchema } from '@pgim/shared';
import { createApp } from './app';

describe('GET /api/health', () => {
  it('responde ok con un timestamp ISO', async () => {
    const res = await request(createApp()).get('/api/health');

    expect(res.status).toBe(200);
    expect(healthResponseSchema.safeParse(res.body).success).toBe(true);
  });
});

describe('rutas inexistentes', () => {
  it('responden 404 en JSON', async () => {
    const res = await request(createApp()).get('/api/no-existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Recurso no encontrado' });
  });
});
