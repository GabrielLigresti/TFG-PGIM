import jwt from 'jsonwebtoken';
import type { CookieOptions } from 'express';
import { env } from '../config/env';

export const COOKIE_SESION = 'sesion';

const DURACION_SEGUNDOS = 8 * 60 * 60;

// El token solo identifica al usuario y su sucursal de trabajo: rol y permisos
// se leen de la base en cada request para que los cambios apliquen al instante.
export interface TokenSesion {
  usuarioId: string;
  sucursalId: string | null;
}

export function firmarToken({ usuarioId, sucursalId }: TokenSesion): string {
  return jwt.sign({ sucursalId }, env.JWT_SECRET, {
    subject: usuarioId,
    expiresIn: DURACION_SEGUNDOS,
    algorithm: 'HS256',
  });
}

export function verificarToken(token: string): TokenSesion | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub) return null;
    const sucursalId = typeof payload.sucursalId === 'string' ? payload.sucursalId : null;
    return { usuarioId: payload.sub, sucursalId };
  } catch {
    return null;
  }
}

export const opcionesCookie: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/',
  maxAge: DURACION_SEGUNDOS * 1000,
};
