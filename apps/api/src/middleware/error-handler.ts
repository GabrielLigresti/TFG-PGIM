import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado' });
};

// P2002 de Prisma: violación de una clave única. Los servicios validan antes,
// pero dos altas simultáneas pueden llegar igual hasta la base.
function esClaveDuplicada(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
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
  if (esClaveDuplicada(err)) {
    res.status(409).json({ error: 'Ya existe un registro con esos datos' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
};
