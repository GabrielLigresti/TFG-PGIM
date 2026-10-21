import type { Sesion } from '@pgim/shared';
import { AppError } from '../lib/errors';
import { firmarToken, type TokenSesion } from '../lib/jwt';
import { hashPassword, verifyPassword } from '../lib/password';
import {
  usuarioRepository,
  type UsuarioRepository,
  type UsuarioSesion,
} from '../repositories/usuario.repository';

const CREDENCIALES_INCORRECTAS = 'Email o contraseña incorrectos';
const CUENTA_DESHABILITADA = 'La cuenta está deshabilitada';

export interface SesionIniciada {
  token: string;
  sesion: Sesion;
}

// Se verifica contra este hash cuando el email no existe, para que el tiempo
// de respuesta no revele qué emails están registrados.
let hashFicticio: Promise<string> | undefined;

function construirSesion(usuario: UsuarioSesion, sucursalId: string | null): Sesion {
  const { empleado } = usuario;
  const sucursales = empleado?.sucursales ?? [];
  return {
    usuario: {
      id: usuario.id,
      email: usuario.email,
      tipo: usuario.tipo,
      nombre: empleado?.nombreCompleto ?? usuario.comensal?.nombre ?? usuario.email,
    },
    restaurante: empleado?.restaurante ?? null,
    rol: empleado?.rol ?? null,
    permisos: empleado?.permisos ?? [],
    sucursales,
    sucursalActiva: sucursales.find((s) => s.id === sucursalId) ?? null,
  };
}

export function createAuthService(repo: UsuarioRepository) {
  async function cargarActivo(usuarioId: string): Promise<UsuarioSesion | null> {
    const usuario = await repo.findSesionById(usuarioId);
    return usuario?.activo ? usuario : null;
  }

  return {
    async iniciarSesion(email: string, password: string): Promise<SesionIniciada> {
      const credenciales = await repo.findCredencialesByEmail(email);
      hashFicticio ??= hashPassword('contraseña-ficticia');
      const valida = await verifyPassword(
        password,
        credenciales?.passwordHash ?? (await hashFicticio),
      );
      if (!credenciales || !valida) throw new AppError(401, CREDENCIALES_INCORRECTAS);
      if (!credenciales.activo) throw new AppError(403, CUENTA_DESHABILITADA);

      const usuario = await cargarActivo(credenciales.id);
      if (!usuario) throw new AppError(403, CUENTA_DESHABILITADA);

      // Flujo B del CU-01: con varias sucursales, la elige después del login.
      const sucursales = usuario.empleado?.sucursales ?? [];
      const sucursalId = sucursales.length === 1 ? sucursales[0]!.id : null;
      return {
        token: firmarToken({ usuarioId: usuario.id, sucursalId }),
        sesion: construirSesion(usuario, sucursalId),
      };
    },

    async seleccionarSucursal(usuarioId: string, sucursalId: string): Promise<SesionIniciada> {
      const usuario = await cargarActivo(usuarioId);
      if (!usuario) throw new AppError(401, 'Sesión no válida');
      if (!usuario.empleado?.sucursales.some((s) => s.id === sucursalId)) {
        throw new AppError(403, 'No trabajás en esa sucursal');
      }
      return {
        token: firmarToken({ usuarioId, sucursalId }),
        sesion: construirSesion(usuario, sucursalId),
      };
    },

    // Devuelve null si el usuario ya no existe o fue dado de baja.
    async obtenerSesion({ usuarioId, sucursalId }: TokenSesion): Promise<Sesion | null> {
      const usuario = await cargarActivo(usuarioId);
      return usuario && construirSesion(usuario, sucursalId);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;

export const authService = createAuthService(usuarioRepository);
