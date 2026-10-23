import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, esClaveDuplicada } from '../lib/errors';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado' });
};

// Errores de los parsers de Express (cuerpo demasiado grande, JSON mal formado):
// traen un status 4xx y un `type`.
function errorDeCuerpo(err: unknown): { status: number; tipo: string } | null {
  if (typeof err !== 'object' || err === null || !('type' in err) || !('status' in err)) {
    return null;
  }
  const { status, type } = err as { status: unknown; type: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 && typeof type === 'string'
    ? { status, tipo: type }
    : null;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res
      .status(err.status)
      .json(
        err.detalles === undefined
          ? { error: err.message }
          : { error: err.message, detalles: err.detalles },
      );
    return;
  }
  if (err instanceof ZodError) {
    res
      .status(400)
      .json({ error: err.issues[0]?.message ?? 'Datos inválidos', detalles: err.issues });
    return;
  }
  const cuerpo = errorDeCuerpo(err);
  if (cuerpo) {
    res.status(cuerpo.status).json({
      error:
        cuerpo.tipo === 'entity.too.large'
          ? 'El archivo es demasiado grande'
          : 'El pedido no tiene un formato válido',
    });
    return;
  }
  if (esClaveDuplicada(err)) {
    res.status(409).json({ error: 'Ya existe un registro con esos datos' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
};
