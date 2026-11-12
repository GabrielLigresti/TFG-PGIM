import { verificarToken } from '../lib/jwt';
import { AppError } from '../lib/errors';
import type { IdentidadGoogle } from '../lib/google';
import {
  GOOGLE_ID_FALSO,
  IDS,
  PASSWORD,
  crearRepositorioFalso,
  type RepositorioFalso,
} from '../test/fake-usuarios';
import { createAuthService, type AuthService } from './auth.service';

let service: AuthService;

beforeAll(async () => {
  service = createAuthService(await crearRepositorioFalso());
});

describe('iniciarSesion', () => {
  it('una cuenta sin contraseña da el mismo 401 que un email inexistente', async () => {
    await expect(service.iniciarSesion('google@demo.test', PASSWORD)).rejects.toEqual(
      new AppError(401, 'Email o contraseña incorrectos'),
    );
  });

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

describe('iniciarSesionConGoogle', () => {
  const REINTENTAR = new AppError(401, 'No pudimos validar tu cuenta de Google. Probá de nuevo.');
  const PERSONAL = new AppError(
    403,
    'Esta cuenta es del personal de un restaurante. Entrá con tu email y contraseña.',
  );

  let repo: RepositorioFalso;
  let crear: jest.SpyInstance;
  let vincular: jest.SpyInstance;
  let buscarPorEmail: jest.SpyInstance;
  let buscarPorGoogleId: jest.SpyInstance;

  function servicioCon(identidad: Partial<IdentidadGoogle> | null): AuthService {
    const verificar = jest.fn().mockResolvedValue(
      identidad && {
        sub: 'sub-nuevo',
        email: 'ana@gmail.com',
        emailVerificado: true,
        nombre: 'Ana',
        ...identidad,
      },
    );
    return createAuthService(repo, undefined, { verificar });
  }

  beforeEach(async () => {
    repo = await crearRepositorioFalso();
    crear = jest.spyOn(repo, 'crearComensalGoogle');
    vincular = jest.spyOn(repo, 'vincularGoogle');
    buscarPorEmail = jest.spyOn(repo, 'findCuentaByEmail');
    buscarPorGoogleId = jest.spyOn(repo, 'findCuentaByGoogleId');
  });

  it('crea un comensal nuevo y devuelve su sesión', async () => {
    const { token, sesion } = await servicioCon({}).iniciarSesionConGoogle('cred');

    expect(crear).toHaveBeenCalledWith({
      email: 'ana@gmail.com',
      googleId: 'sub-nuevo',
      nombre: 'Ana',
    });
    expect(sesion.usuario.tipo).toBe('COMENSAL');
    expect(verificarToken(token)).toEqual({ usuarioId: IDS.comensalNuevo, sucursalId: null });
  });

  it('entra por google_id aunque el email haya cambiado', async () => {
    const { sesion } = await servicioCon({
      sub: GOOGLE_ID_FALSO,
      email: 'otro@gmail.com',
    }).iniciarSesionConGoogle('cred');

    expect(sesion.usuario.id).toBe(IDS.comensalGoogle);
    expect(crear).not.toHaveBeenCalled();
    expect(vincular).not.toHaveBeenCalled();
  });

  it('vincula un comensal existente por email', async () => {
    const { sesion } = await servicioCon({ email: 'comensal@demo.test' }).iniciarSesionConGoogle(
      'cred',
    );

    expect(sesion.usuario.id).toBe(IDS.comensal);
    expect(vincular).toHaveBeenCalledWith(IDS.comensal, 'sub-nuevo');
  });

  it('rechaza a un empleado sin vincular', async () => {
    await expect(
      servicioCon({ email: 'mozo@demo.test' }).iniciarSesionConGoogle('cred'),
    ).rejects.toEqual(PERSONAL);
    expect(vincular).not.toHaveBeenCalled();
  });

  it('rechaza a un empleado deshabilitado con el 403 de personal', async () => {
    await expect(
      servicioCon({ email: 'inactivo@demo.test' }).iniciarSesionConGoogle('cred'),
    ).rejects.toEqual(PERSONAL);
    expect(vincular).not.toHaveBeenCalled();
  });

  it('rechaza a un comensal deshabilitado sin vincular', async () => {
    await expect(
      servicioCon({ email: 'baja@demo.test' }).iniciarSesionConGoogle('cred'),
    ).rejects.toEqual(new AppError(403, 'La cuenta está deshabilitada'));
    expect(vincular).not.toHaveBeenCalled();
  });

  it('rechaza un email sin verificar', async () => {
    await expect(
      servicioCon({ emailVerificado: false }).iniciarSesionConGoogle('cred'),
    ).rejects.toEqual(REINTENTAR);
    expect(crear).not.toHaveBeenCalled();
  });

  it('un token inválido da 401', async () => {
    await expect(servicioCon(null).iniciarSesionConGoogle('cred')).rejects.toEqual(REINTENTAR);
  });

  it('sin verificador configurado da 503', async () => {
    const sinGoogle = createAuthService(repo, undefined, null);

    await expect(sinGoogle.iniciarSesionConGoogle('cred')).rejects.toEqual(
      new AppError(503, 'El ingreso con Google no está disponible'),
    );
  });

  it('busca por el email en minúsculas que llega del verificador', async () => {
    await servicioCon({ email: 'ana@gmail.com' }).iniciarSesionConGoogle('cred');

    expect(buscarPorEmail).toHaveBeenCalledWith('ana@gmail.com');
  });

  it('un nombre vacío usa la parte del email antes de la @', async () => {
    await servicioCon({ nombre: '   ', email: 'juan.perez@gmail.com' }).iniciarSesionConGoogle(
      'cred',
    );

    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'juan.perez' }));
  });

  it('un nombre ausente usa la parte del email antes de la @', async () => {
    await servicioCon({ nombre: null, email: 'juan.perez@gmail.com' }).iniciarSesionConGoogle(
      'cred',
    );

    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'juan.perez' }));
  });

  it('un nombre largo se recorta a 100', async () => {
    await servicioCon({ nombre: 'a'.repeat(150) }).iniciarSesionConGoogle('cred');

    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'a'.repeat(100) }));
  });

  it('ante una clave duplicada en el alta relee y entra', async () => {
    repo.forzarClaveDuplicada();

    const { sesion } = await servicioCon({}).iniciarSesionConGoogle('cred');

    expect(sesion.usuario.id).toBe(IDS.comensalNuevo);
    expect(crear).toHaveBeenCalledTimes(1);
    // Una lectura inicial y una sola relectura.
    expect(buscarPorGoogleId).toHaveBeenCalledTimes(2);
  });

  it('ante una clave duplicada en el vínculo relee y entra sin volver a vincular', async () => {
    repo.forzarClaveDuplicada();

    const { sesion } = await servicioCon({ email: 'comensal@demo.test' }).iniciarSesionConGoogle(
      'cred',
    );

    expect(sesion.usuario.id).toBe(IDS.comensal);
    expect(vincular).toHaveBeenCalledTimes(1);
    expect(buscarPorGoogleId).toHaveBeenCalledTimes(2);
  });

  it('si la relectura no encuentra la cuenta propaga el error', async () => {
    crear.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));

    await expect(servicioCon({}).iniciarSesionConGoogle('cred')).rejects.toMatchObject({
      code: 'P2002',
    });
    expect(crear).toHaveBeenCalledTimes(1);
  });
});
