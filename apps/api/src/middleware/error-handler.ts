import type { ErrorRequestHandler, RequestHandler } from 'express';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado' });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
};
