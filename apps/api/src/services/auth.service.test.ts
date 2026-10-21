import { verificarToken } from '../lib/jwt';
import { AppError } from '../lib/errors';
import { IDS, PASSWORD, crearRepositorioFalso } from '../test/fake-usuarios';
import { createAuthService, type AuthService } from './auth.service';

let service: AuthService;

beforeAll(async () => {
  service = createAuthService(await crearRepositorioFalso());
});

describe('iniciarSesion', () => {
  it('con una sola sucursal la deja como sucursal activa', async () => {
    const { token, sesion } = await service.iniciarSesion('mozo@demo.test', PASSWORD);

    expect(sesion.sucursalActiva).toEqual({ id: IDS.centro, nombre: 'Centro' });
    expect(sesion.permisos).toEqual(['sucursal.ver']);
    expect(verificarToken(token)).toEqual({ usuarioId: IDS.mozo, sucursalId: IDS.centro });
  });

  it('con varias sucursales no elige ninguna (flujo B)', async () => {
    const { token, sesion } = await service.iniciarSesion('admin@demo.test', PASSWORD);

    expect(sesion.sucursalActiva).toBeNull();
    expect(sesion.sucursales).toHaveLength(2);
    expect(verificarToken(token)?.sucursalId).toBeNull();
  });

  it('el comensal no tiene restaurante, rol ni permisos', async () => {
    const { sesion } = await service.iniciarSesion('comensal@demo.test', PASSWORD);

    expect(sesion.usuario.tipo).toBe('COMENSAL');
    expect(sesion.restaurante).toBeNull();
    expect(sesion.rol).toBeNull();
    expect(sesion.permisos).toEqual([]);
  });

  it('contraseña incorrecta y email inexistente dan el mismo error (E2)', async () => {
    const error = new AppError(401, 'Email o contraseña incorrectos');

    await expect(service.iniciarSesion('mozo@demo.test', 'otra')).rejects.toEqual(error);
    await expect(service.iniciarSesion('nadie@demo.test', PASSWORD)).rejects.toEqual(error);
  });

  it('rechaza al usuario inactivo (E3)', async () => {
    await expect(service.iniciarSesion('inactivo@demo.test', PASSWORD)).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('seleccionarSucursal', () => {
  it('acepta una sucursal asignada', async () => {
    const { token, sesion } = await service.seleccionarSucursal(IDS.admin, IDS.palermo);

    expect(sesion.sucursalActiva?.nombre).toBe('Palermo');
    expect(verificarToken(token)?.sucursalId).toBe(IDS.palermo);
  });

  it('rechaza una sucursal que no tiene asignada', async () => {
    await expect(service.seleccionarSucursal(IDS.mozo, IDS.palermo)).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('obtenerSesion', () => {
  it('devuelve null si el usuario fue dado de baja', async () => {
    await expect(
      service.obtenerSesion({ usuarioId: IDS.inactivo, sucursalId: IDS.centro }),
    ).resolves.toBeNull();
  });

  it('ignora una sucursal del token que ya no está asignada', async () => {
    const sesion = await service.obtenerSesion({ usuarioId: IDS.mozo, sucursalId: IDS.ajena });

    expect(sesion?.sucursalActiva).toBeNull();
  });
});
