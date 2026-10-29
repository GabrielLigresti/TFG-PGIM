import type { RequestHandler } from 'express';
import type { CodigoPermiso, Sesion } from '@pgim/shared';
import type { z } from 'zod';
import { AppError } from '../lib/errors';
import { COOKIE_SESION, verificarToken } from '../lib/jwt';
import { authService } from '../services/auth.service';
import '../types/express';

// Cadena de middleware de las rutas protegidas:
// autenticar → tenant → requierePermiso → validar (o autenticar → soloTipo para el comensal).

export const autenticar: RequestHandler = async (req, _res, next) => {
  const token: unknown = req.cookies?.[COOKIE_SESION];
  const datos = typeof token === 'string' ? verificarToken(token) : null;
  const sesion = datos && (await authService.obtenerSesion(datos));
  if (!sesion) throw new AppError(401, 'Sesión no válida o vencida');
  req.sesion = sesion;
  next();
};

export const tenant: RequestHandler = (req, _res, next) => {
  const { sesion } = req;
  if (!sesion?.restaurante) throw new AppError(403, 'Acceso solo para personal del restaurante');
  req.tenant = {
    restauranteId: sesion.restaurante.id,
    sucursalId: sesion.sucursalActiva?.id ?? null,
  };
  next();
};

// Rutas del comensal: no pasan por tenant porque no pertenece a un restaurante.
export function soloTipo(tipo: Sesion['usuario']['tipo']): RequestHandler {
  return (req, _res, next) => {
    if (req.sesion?.usuario.tipo !== tipo) {
      throw new AppError(403, 'Esta sección no está disponible para tu tipo de cuenta');
    }
    next();
  };
}

export function requierePermiso(codigo: CodigoPermiso): RequestHandler {
  return (req, _res, next) => {
    if (!req.sesion?.permisos.includes(codigo)) {
      throw new AppError(403, 'No tenés permiso para esta acción');
    }
    next();
  };
}

// Pasa con cualquiera de los permisos indicados.
export function requiereAlgunPermiso(...codigos: CodigoPermiso[]): RequestHandler {
  return (req, _res, next) => {
    if (!codigos.some((codigo) => req.sesion?.permisos.includes(codigo))) {
      throw new AppError(403, 'No tenés permiso para esta acción');
    }
    next();
  };
}

export function validar(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
}

// Los ids de la URL son uuid: sin validarlos, Prisma rechaza el formato con un 500.
export function validarParams(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    schema.parse(req.params);
    next();
  };
}
