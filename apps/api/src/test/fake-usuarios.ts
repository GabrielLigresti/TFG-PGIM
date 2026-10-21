import { hashPassword } from '../lib/password';
import type {
  CredencialesUsuario,
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
];

export const PASSWORD = 'secreta123';

// Repositorio en memoria con los usuarios de arriba, todos con PASSWORD.
export async function crearRepositorioFalso(): Promise<UsuarioRepository> {
  const passwordHash = await hashPassword(PASSWORD);
  return {
    async findCredencialesByEmail(email): Promise<CredencialesUsuario | null> {
      const usuario = USUARIOS.find((u) => u.email === email);
      return usuario ? { id: usuario.id, passwordHash, activo: usuario.activo } : null;
    },
    async findSesionById(id) {
      return USUARIOS.find((u) => u.id === id) ?? null;
    },
  };
}
