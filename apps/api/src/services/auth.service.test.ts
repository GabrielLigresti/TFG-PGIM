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

describe('registrarComensal', () => {
  const datos = { nombre: 'Nueva', email: 'nueva@demo.test', password: 'clave1234' };

  it('registra un comensal y devuelve su sesión', async () => {
    const repo = await crearRepositorioFalso();
    const crearComensal = jest.spyOn(repo, 'crearComensal');

    const { token, sesion } = await createAuthService(repo).registrarComensal(datos);

    const recibido = crearComensal.mock.calls[0]![0];
    expect(recibido.passwordHash.startsWith('scrypt$')).toBe(true);
    expect(JSON.stringify(recibido)).not.toContain('clave1234');
    expect(recibido).toMatchObject({ email: 'nueva@demo.test', nombre: 'Nueva', telefono: null });
    expect(sesion.usuario.tipo).toBe('COMENSAL');
    expect(verificarToken(token)).toEqual({ usuarioId: IDS.comensal, sucursalId: null });
  });

  it('un email ya registrado responde 409', async () => {
    const repo = await crearRepositorioFalso();
    jest.spyOn(repo, 'crearComensal').mockRejectedValue({ code: 'P2002' });

    await expect(createAuthService(repo).registrarComensal(datos)).rejects.toMatchObject({
      status: 409,
      message: 'Ya existe una cuenta con ese email',
    });
  });
});

describe('registrarRestaurante', () => {
  const datos = {
    restaurante: { nombre: 'Restaurante nuevo', cuit: '30712345678' },
    sucursal: {
      nombre: 'Casa central',
      direccion: 'Calle Falsa 123',
      barrio: 'SAN_NICOLAS' as const,
      horarioApertura: '12:00',
      horarioCierre: '23:30',
      toleranciaNoShowMin: 15,
      horariosServicio: [],
    },
    administrador: { nombreCompleto: 'Ana Pérez', email: 'ana@demo.test', password: 'clave1234' },
  };

  async function armar(registrar: jest.Mock) {
    return createAuthService(await crearRepositorioFalso(), { registrar });
  }

  it('crea el alta con el hash de la contraseña y abre la sesión en la sucursal nueva', async () => {
    const registrar = jest
      .fn()
      .mockResolvedValue({ usuarioId: IDS.admin, sucursalId: IDS.palermo });

    const { token, sesion } = await (await armar(registrar)).registrarRestaurante(datos);

    const recibido = registrar.mock.calls[0]![0];
    expect(recibido.administrador.passwordHash.startsWith('scrypt$')).toBe(true);
    expect(JSON.stringify(recibido)).not.toContain('clave1234');
    expect(recibido).toMatchObject({
      restaurante: datos.restaurante,
      sucursal: datos.sucursal,
      administrador: { nombreCompleto: 'Ana Pérez', email: 'ana@demo.test' },
    });
    expect(sesion.sucursalActiva?.id).toBe(IDS.palermo);
    expect(verificarToken(token)).toEqual({ usuarioId: IDS.admin, sucursalId: IDS.palermo });
  });

  it.each([
    ['target como lista de campos', { target: ['cuit'] }, 'cuit'],
    ['target como nombre de restricción', { target: 'restaurante_cuit_key' }, 'cuit'],
    [
      'campos en el error del adaptador',
      { driverAdapterError: { cause: { constraint: { fields: ['email'] } } } },
      'email',
    ],
  ])('un P2002 con %s responde 409 con el campo', async (_caso, meta, campo) => {
    const registrar = jest.fn().mockRejectedValue({ code: 'P2002', meta });

    await expect((await armar(registrar)).registrarRestaurante(datos)).rejects.toMatchObject({
      status: 409,
      detalles: { campo },
    });
  });

  it('un P2002 de otra restricción no se traduce: se propaga', async () => {
    const error = { code: 'P2002', meta: { target: ['otra'] } };
    const registrar = jest.fn().mockRejectedValue(error);

    await expect((await armar(registrar)).registrarRestaurante(datos)).rejects.toBe(error);
  });
});
