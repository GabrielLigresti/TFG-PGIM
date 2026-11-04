import request from 'supertest';
import { createApp } from '../app';
import { AppError } from '../lib/errors';
import { verificarToken } from '../lib/jwt';
import { IDS, crearRepositorioFalso } from '../test/fake-usuarios';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));
jest.mock('../repositories/restaurante.repository', () => ({
  restauranteRepository: { registrar: jest.fn() },
}));

const valido = {
  restaurante: { nombre: 'Restaurante nuevo', cuit: '30-71234567-8' },
  sucursal: {
    nombre: 'Casa central',
    direccion: 'Calle Falsa 123',
    horarioApertura: '12:00',
    horarioCierre: '23:30',
    toleranciaNoShowMin: 15,
    horariosServicio: [{ franja: 'ALMUERZO', horaInicio: '12:00', horaFin: '16:00' }],
  },
  administrador: { nombreCompleto: 'Ana Pérez', email: 'ana@demo.test', password: 'clave1234' },
};

const mockRestaurante = () =>
  jest.requireMock('../repositories/restaurante.repository').restauranteRepository.registrar;

beforeAll(async () => {
  const { usuarioRepository } = jest.requireMock('../repositories/usuario.repository');
  const falso = await crearRepositorioFalso();
  usuarioRepository.findSesionById.mockImplementation(falso.findSesionById);
});

beforeEach(() => {
  mockRestaurante().mockReset();
  mockRestaurante().mockResolvedValue({ usuarioId: IDS.admin, sucursalId: IDS.centro });
});

describe('POST /api/auth/registro-restaurante', () => {
  it('crea el alta, setea la cookie con la sucursal y responde 201 con la sesión', async () => {
    const res = await request(createApp()).post('/api/auth/registro-restaurante').send(valido);

    expect(res.status).toBe(201);
    expect(res.body.sucursalActiva.id).toBe(IDS.centro);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^sesion=/);
    expect(cookie).toMatch(/HttpOnly/);
    const token = /^sesion=([^;]+)/.exec(cookie)![1]!;
    expect(verificarToken(token)).toEqual({ usuarioId: IDS.admin, sucursalId: IDS.centro });
    // El CUIT llega al repositorio sin guiones.
    expect(mockRestaurante().mock.calls[0][0].restaurante.cuit).toBe('30712345678');
  });

  it('responde 400 con datos inválidos y no toca el repositorio', async () => {
    const res = await request(createApp())
      .post('/api/auth/registro-restaurante')
      .send({ ...valido, restaurante: { nombre: 'X', cuit: '123' } });

    expect(res.status).toBe(400);
    expect(mockRestaurante()).not.toHaveBeenCalled();
  });

  it.each([
    ['cuit', { target: ['cuit'] }],
    ['email', { target: ['email'] }],
  ])('responde 409 con el campo %s cuando choca', async (campo, meta) => {
    mockRestaurante().mockRejectedValue({ code: 'P2002', meta });

    const res = await request(createApp()).post('/api/auth/registro-restaurante').send(valido);

    expect(res.status).toBe(409);
    expect(res.body.detalles).toEqual({ campo });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('propaga el error del catálogo de permisos incompleto como 500', async () => {
    mockRestaurante().mockRejectedValue(
      new AppError(500, 'El catálogo de permisos no está cargado'),
    );

    const res = await request(createApp()).post('/api/auth/registro-restaurante').send(valido);

    expect(res.status).toBe(500);
  });
});
