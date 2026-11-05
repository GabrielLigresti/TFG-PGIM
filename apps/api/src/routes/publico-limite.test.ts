import request from 'supertest';
import { createApp } from '../app';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

jest.mock('../services/publico.service', () => ({
  publicoService: {
    buscar: jest.fn().mockResolvedValue([]),
    obtenerMenu: jest.fn().mockResolvedValue({ sucursal: {}, menu: null }),
  },
}));

// En su propio archivo: el contador del límite es del módulo y arranca de cero.
describe('límite de solicitudes públicas', () => {
  it('la solicitud 61 en un minuto desde la misma IP responde 429', async () => {
    const app = createApp();

    for (let n = 1; n <= 60; n++) {
      expect((await request(app).get('/api/publico/buscar')).status).toBe(200);
    }
    expect((await request(app).get('/api/publico/buscar')).status).toBe(429);
  });

  it('agotado el límite de búsqueda, la carta sigue abierta', async () => {
    const app = createApp();
    // Agota su propio contador: así corre sola, con -t.
    for (let n = 1; n <= 60; n++) await request(app).get('/api/publico/buscar');
    expect((await request(app).get('/api/publico/buscar')).status).toBe(429);

    const id = '01900000-0000-7000-8000-000000000011';
    expect((await request(app).get(`/api/publico/sucursales/${id}/menu`)).status).toBe(200);
  });
});
