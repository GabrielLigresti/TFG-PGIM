import request from 'supertest';
import { createApp } from '../app';
import { crearRepositorioFalso } from '../test/fake-usuarios';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: {
    findCredencialesByEmail: jest.fn(),
    findSesionById: jest.fn(),
    crearComensal: jest.fn(),
  },
}));

beforeAll(async () => {
  const { usuarioRepository } = jest.requireMock('../repositories/usuario.repository');
  const falso = await crearRepositorioFalso();
  usuarioRepository.findSesionById.mockImplementation(falso.findSesionById);
  usuarioRepository.crearComensal.mockImplementation(falso.crearComensal);
});

// En su propio archivo: el contador del límite es del módulo y arranca de cero.
describe('límite de registros', () => {
  it('después de 10 altas desde la misma IP responde 429, aunque hayan salido bien', async () => {
    const app = createApp();
    const registrar = (n: number) =>
      request(app)
        .post('/api/auth/registro')
        .send({ nombre: 'Nueva', email: `nueva${n}@demo.test`, password: 'clave1234' });

    for (let n = 1; n <= 10; n++) expect((await registrar(n)).status).toBe(201);
    expect((await registrar(11)).status).toBe(429);
  });
});
