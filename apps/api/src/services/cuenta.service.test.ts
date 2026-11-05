import { AppError } from '../lib/errors';
import { hashPassword, verifyPassword } from '../lib/password';
import type { CuentaRepository } from '../repositories/cuenta.repository';
import { createCuentaService, type ArchivosFoto } from './cuenta.service';

const U = 'usuario-1';
const R = 'restaurante-1';

function repoFalso(
  sobre: Partial<jest.Mocked<CuentaRepository>> = {},
): jest.Mocked<CuentaRepository> {
  return {
    findComensal: jest
      .fn()
      .mockResolvedValue({ email: 'c@demo.test', nombre: 'Cora', telefono: '1155' }),
    findEmpleado: jest.fn().mockImplementation(async (_u: string, restauranteId: string) =>
      restauranteId === R
        ? {
            email: 'e@demo.test',
            nombreCompleto: 'Eli',
            fotoUrl: null,
            rol: 'Mozo',
            sucursales: ['Centro'],
          }
        : null,
    ),
    actualizarComensal: jest.fn().mockResolvedValue(true),
    actualizarEmpleado: jest
      .fn()
      .mockImplementation(async (_u: string, restauranteId: string) => restauranteId === R),
    guardarFotoEmpleado: jest.fn().mockResolvedValue(true),
    findFotoEmpleado: jest.fn().mockResolvedValue('/api/uploads/fotos/vieja.jpg'),
    findPasswordHash: jest.fn(),
    guardarPasswordHash: jest.fn(),
    ...sobre,
  };
}

function fotosFalsas(): jest.Mocked<ArchivosFoto> {
  return {
    validarFoto: jest.fn().mockReturnValue('png'),
    guardarFoto: jest.fn().mockResolvedValue('/api/uploads/fotos/nueva.png'),
    borrarFoto: jest.fn(),
  };
}

describe('cuentaService.obtener', () => {
  it('devuelve los campos del comensal', async () => {
    const s = createCuentaService(repoFalso(), fotosFalsas());
    expect(await s.obtener(U, null)).toEqual({
      tipo: 'COMENSAL',
      email: 'c@demo.test',
      nombre: 'Cora',
      telefono: '1155',
    });
  });

  it('devuelve los campos del empleado', async () => {
    const s = createCuentaService(repoFalso(), fotosFalsas());
    expect(await s.obtener(U, R)).toEqual({
      tipo: 'EMPLEADO',
      email: 'e@demo.test',
      nombreCompleto: 'Eli',
      fotoUrl: null,
      rol: 'Mozo',
      sucursales: ['Centro'],
    });
  });
});

describe('cuentaService: datos', () => {
  it('actualizarComensal con teléfono vacío guarda null', async () => {
    const repo = repoFalso();
    await createCuentaService(repo, fotosFalsas()).actualizarComensal(U, {
      nombre: 'Cora',
      telefono: '',
    });
    expect(repo.actualizarComensal).toHaveBeenCalledWith(U, { nombre: 'Cora', telefono: null });
  });

  it('actualizarEmpleado con un restauranteId ajeno responde 404', async () => {
    const s = createCuentaService(repoFalso(), fotosFalsas());
    await expect(s.actualizarEmpleado(U, 'otro', { nombreCompleto: 'X' })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('cuentaService.cambiarContrasena', () => {
  it('con la actual errónea responde 400 y no guarda', async () => {
    const repo = repoFalso({
      findPasswordHash: jest.fn().mockResolvedValue(await hashPassword('vieja1234')),
    });
    const s = createCuentaService(repo, fotosFalsas());
    const error = await s.cambiarContrasena(U, 'otra-cosa', 'nueva1234').catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 400, message: 'La contraseña actual no es correcta' });
    expect(repo.guardarPasswordHash).not.toHaveBeenCalled();
  });

  it('con la actual correcta guarda un hash que acepta la nueva', async () => {
    const repo = repoFalso({
      findPasswordHash: jest.fn().mockResolvedValue(await hashPassword('vieja1234')),
    });
    await createCuentaService(repo, fotosFalsas()).cambiarContrasena(U, 'vieja1234', 'nueva1234');
    const [id, hash] = repo.guardarPasswordHash.mock.calls[0]!;
    expect(id).toBe(U);
    expect(await verifyPassword('nueva1234', hash)).toBe(true);
    expect(await verifyPassword('vieja1234', hash)).toBe(false);
  });
});

describe('cuentaService.subirFoto', () => {
  it('valida, guarda la nueva y borra la anterior', async () => {
    const repo = repoFalso();
    const fotos = fotosFalsas();
    const archivo = Buffer.from('x');
    const res = await createCuentaService(repo, fotos).subirFoto(U, R, archivo);
    expect(fotos.validarFoto).toHaveBeenCalledWith(archivo);
    expect(fotos.guardarFoto).toHaveBeenCalledWith(archivo, 'png');
    expect(repo.guardarFotoEmpleado).toHaveBeenCalledWith(U, R, '/api/uploads/fotos/nueva.png');
    expect(fotos.borrarFoto).toHaveBeenCalledWith('/api/uploads/fotos/vieja.jpg');
    expect(res).toEqual({ fotoUrl: '/api/uploads/fotos/nueva.png' });
  });

  it('si no se guarda la fila, borra la foto recién subida y no la anterior', async () => {
    const repo = repoFalso({ guardarFotoEmpleado: jest.fn().mockResolvedValue(false) });
    const fotos = fotosFalsas();
    await expect(
      createCuentaService(repo, fotos).subirFoto(U, 'otro', Buffer.from('x')),
    ).rejects.toMatchObject({ status: 404 });
    expect(fotos.borrarFoto).toHaveBeenCalledTimes(1);
    expect(fotos.borrarFoto).toHaveBeenCalledWith('/api/uploads/fotos/nueva.png');
  });
});
