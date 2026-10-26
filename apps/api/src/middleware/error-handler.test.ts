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
  it('un registro que no existe (P2025 de Prisma) responde 404, no 500, y queda en el log', async () => {
    const aviso = jest.spyOn(console, 'warn').mockImplementation();
    const error = { code: 'P2025' };

    const res = await request(appQueFalla(error)).get('/');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Recurso no encontrado' });
    expect(aviso).toHaveBeenCalledWith(expect.any(String), error);
    aviso.mockRestore();
  });

  it('una clave duplicada (P2002) responde 409', async () => {
    expect((await request(appQueFalla({ code: 'P2002' })).get('/')).status).toBe(409);
  });
});
