import type { RegistroComensal, RegistroRestaurante, Sesion } from '@pgim/shared';
import { AppError, camposDeClaveDuplicada, esClaveDuplicada } from '../lib/errors';
import { firmarToken, type TokenSesion } from '../lib/jwt';
import { hashPassword, verifyPassword } from '../lib/password';
import {
  restauranteRepository,
  type RestauranteRepository,
} from '../repositories/restaurante.repository';
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

export function createAuthService(
  repo: UsuarioRepository,
  restaurantes: RestauranteRepository = restauranteRepository,
) {
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

    // Registro de comensal: queda con la sesión iniciada, como después del login.
    async registrarComensal(datos: RegistroComensal): Promise<SesionIniciada> {
      let usuarioId: string;
      try {
        usuarioId = await repo.crearComensal({
          email: datos.email,
          passwordHash: await hashPassword(datos.password),
          nombre: datos.nombre,
          telefono: datos.telefono || null,
        });
      } catch (err) {
        if (esClaveDuplicada(err)) throw new AppError(409, 'Ya existe una cuenta con ese email');
        throw err;
      }
      const usuario = await cargarActivo(usuarioId);
      if (!usuario) throw new AppError(500, 'No se pudo iniciar la sesión');
      return {
        token: firmarToken({ usuarioId, sucursalId: null }),
        sesion: construirSesion(usuario, null),
      };
    },

    // CU-11: alta del restaurante con su sucursal y su administrador. Queda con
    // la sesión iniciada en la sucursal nueva, como después del login.
    async registrarRestaurante(datos: RegistroRestaurante): Promise<SesionIniciada> {
      let alta: { usuarioId: string; sucursalId: string };
      try {
        alta = await restaurantes.registrar({
          restaurante: datos.restaurante,
          sucursal: datos.sucursal,
          administrador: {
            nombreCompleto: datos.administrador.nombreCompleto,
            email: datos.administrador.email,
            passwordHash: await hashPassword(datos.administrador.password),
          },
        });
      } catch (err) {
        if (esClaveDuplicada(err)) {
          const campos = camposDeClaveDuplicada(err).join(' ');
          if (campos.includes('cuit')) {
            throw new AppError(409, 'Ya hay un restaurante registrado con ese CUIT', {
              campo: 'cuit',
            });
          }
          if (campos.includes('email')) {
            throw new AppError(409, 'Ya existe una cuenta con ese email', { campo: 'email' });
          }
        }
        throw err;
      }
      const usuario = await cargarActivo(alta.usuarioId);
      if (!usuario) throw new AppError(500, 'No se pudo iniciar la sesión');
      return {
        token: firmarToken({ usuarioId: alta.usuarioId, sucursalId: alta.sucursalId }),
        sesion: construirSesion(usuario, alta.sucursalId),
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
