import request from 'supertest';
import { createApp } from '../app';
import { AppError } from '../lib/errors';
import { cookieDeComensal } from '../test/sesion-falsa';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

jest.mock('../services/cuenta.service', () => ({
  cuentaService: { cambiarContrasena: jest.fn() },
}));

const { cuentaService } = jest.requireMock('../services/cuenta.service');

// En su propio archivo: el contador del límite es del módulo y arranca de cero.
describe('límite de intentos de cambio de contraseña', () => {
  it('el body inválido responde 400 sin gastar intentos, y el sexto fallido responde 429', async () => {
    cuentaService.cambiarContrasena.mockRejectedValue(
      new AppError(400, 'La contraseña actual no es correcta'),
    );
    const app = createApp();
    const cookie = cookieDeComensal();
    const intentar = () =>
      request(app)
        .put('/api/cuenta/contrasena')
        .set('Cookie', cookie)
        .send({ actual: 'equivocada1', nueva: 'nueva-clave1' });

    // La validación va antes del límite: seis pedidos mal formados no bloquean.
    for (let n = 1; n <= 6; n++) {
      const res = await request(app)
        .put('/api/cuenta/contrasena')
        .set('Cookie', cookie)
        .send({ actual: 'equivocada1', nueva: 'corta' });
      expect(res.status).toBe(400);
    }

    for (let n = 1; n <= 5; n++) expect((await intentar()).status).toBe(400);
    expect((await intentar()).status).toBe(429);
  });
});
