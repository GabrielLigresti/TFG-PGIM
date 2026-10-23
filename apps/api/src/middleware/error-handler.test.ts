import express from 'express';
import request from 'supertest';
import { errorHandler } from './error-handler';

function appQueFalla(error: unknown) {
  const app = express();
  app.get('/', () => {
    throw error;
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('un registro que no existe (P2025 de Prisma) responde 404, no 500', async () => {
    const res = await request(appQueFalla({ code: 'P2025' })).get('/');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Recurso no encontrado' });
  });

  it('una clave duplicada (P2002) responde 409', async () => {
    expect((await request(appQueFalla({ code: 'P2002' })).get('/')).status).toBe(409);
  });
});
