import { hashPassword } from '../lib/password';
import type {
  CredencialesUsuario,
  CuentaGoogle,
  UsuarioRepository,
  UsuarioSesion,
} from '../repositories/usuario.repository';

export const IDS = {
  restaurante: '01900000-0000-7000-8000-000000000001',
  centro: '01900000-0000-7000-8000-000000000011',
  palermo: '01900000-0000-7000-8000-000000000012',
  ajena: '01900000-0000-7000-8000-000000000099',
  rol: '01900000-0000-7000-8000-000000000021',
  admin: '01900000-0000-7000-8000-000000000031',
  mozo: '01900000-0000-7000-8000-000000000032',
  inactivo: '01900000-0000-7000-8000-000000000033',
  comensal: '01900000-0000-7000-8000-000000000034',
  comensalGoogle: '01900000-0000-7000-8000-000000000035',
  comensalInactivo: '01900000-0000-7000-8000-000000000036',
  comensalNuevo: '01900000-0000-7000-8000-000000000037',
} as const;

const centro = { id: IDS.centro, nombre: 'Centro' };
const palermo = { id: IDS.palermo, nombre: 'Palermo' };

function empleado(
  id: string,
  email: string,
  sucursales: { id: string; nombre: string }[],
  activo = true,
): UsuarioSesion {
  return {
    id,
    email,
    tipo: 'EMPLEADO',
    activo,
    comensal: null,
    empleado: {
      nombreCompleto: email,
      restaurante: { id: IDS.restaurante, nombre: 'Demo' },
      rol: { id: IDS.rol, nombre: 'Rol' },
      permisos: ['sucursal.ver'],
      sucursales,
    },
  };
}

export const USUARIOS: UsuarioSesion[] = [
  empleado(IDS.admin, 'admin@demo.test', [centro, palermo]),
  empleado(IDS.mozo, 'mozo@demo.test', [centro]),
  empleado(IDS.inactivo, 'inactivo@demo.test', [centro], false),
  {
    id: IDS.comensal,
    email: 'comensal@demo.test',
    tipo: 'COMENSAL',
    activo: true,
    comensal: { nombre: 'Comensal' },
    empleado: null,
  },
  {
    id: IDS.comensalGoogle,
    email: 'google@demo.test',
    tipo: 'COMENSAL',
    activo: true,
    comensal: { nombre: 'Comensal Google' },
    empleado: null,
  },
  {
    id: IDS.comensalInactivo,
    email: 'baja@demo.test',
    tipo: 'COMENSAL',
    activo: false,
    comensal: { nombre: 'Comensal de baja' },
    empleado: null,
  },
];

export const GOOGLE_ID_FALSO = 'sub-google';

export const PASSWORD = 'secreta123';

// Repositorio en memoria con los usuarios de arriba, todos con PASSWORD salvo el de Google.
export interface RepositorioFalso extends UsuarioRepository {
  // La próxima alta o vínculo con Google falla con P2002, como si otro pedido
  // se hubiera adelantado: la escritura ajena sí queda hecha.
  forzarClaveDuplicada(): void;
}

export async function crearRepositorioFalso(): Promise<RepositorioFalso> {
  const passwordHash = await hashPassword(PASSWORD);
  const usuarios = [...USUARIOS];
  const googleIds = new Map<string, string>([[IDS.comensalGoogle, GOOGLE_ID_FALSO]]);
  let duplicar = false;

  function cuentaDe(usuario: UsuarioSesion | undefined): CuentaGoogle | null {
    if (!usuario) return null;
    return {
      id: usuario.id,
      tipo: usuario.tipo,
      activo: usuario.activo,
      googleId: googleIds.get(usuario.id) ?? null,
    };
  }

  function claveDuplicada(): never {
    throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  }

  return {
    forzarClaveDuplicada() {
      duplicar = true;
    },
    async findCuentaByGoogleId(googleId) {
      const id = [...googleIds].find(([, g]) => g === googleId)?.[0];
      return cuentaDe(usuarios.find((u) => u.id === id));
    },
    async findCuentaByEmail(email) {
      return cuentaDe(usuarios.find((u) => u.email === email));
    },
    async vincularGoogle(usuarioId, googleId) {
      if (duplicar || [...googleIds.values()].includes(googleId)) {
        if (duplicar) googleIds.set(usuarioId, googleId);
        duplicar = false;
        claveDuplicada();
      }
      googleIds.set(usuarioId, googleId);
    },
    async crearComensalGoogle({ email, googleId, nombre }) {
      const nuevo: UsuarioSesion = {
        id: IDS.comensalNuevo,
        email,
        tipo: 'COMENSAL',
        activo: true,
        comensal: { nombre },
        empleado: null,
      };
      if (duplicar || usuarios.some((u) => u.email === email)) {
        if (duplicar) {
          usuarios.push(nuevo);
          googleIds.set(nuevo.id, googleId);
        }
        duplicar = false;
        claveDuplicada();
      }
      usuarios.push(nuevo);
      googleIds.set(nuevo.id, googleId);
      return nuevo.id;
    },
    async findCredencialesByEmail(email): Promise<CredencialesUsuario | null> {
      const usuario = usuarios.find((u) => u.email === email);
      if (!usuario) return null;
      // El comensal de Google no tiene contraseña.
      const sinClave = usuario.id === IDS.comensalGoogle;
      return {
        id: usuario.id,
        passwordHash: sinClave ? null : passwordHash,
        activo: usuario.activo,
      };
    },
    async findSesionById(id) {
      return usuarios.find((u) => u.id === id) ?? null;
    },
    // El alta devuelve el comensal de USUARIOS para que la sesión se pueda cargar.
    async crearComensal() {
      return IDS.comensal;
    },
  };
}
