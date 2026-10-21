import express from 'express';
import cookieParser from 'cookie-parser';
import { API_PREFIX } from '@pgim/shared';
import { authRouter } from './routes/auth';
import { healthRouter } from './routes/health';
import { insumosRouter } from './routes/insumos';
import { categoriasRouter, platosRouter } from './routes/menu';
import { personalRouter } from './routes/personal';
import { recetasRouter } from './routes/recetas';
import { rolesRouter } from './routes/roles';
import { sucursalesRouter } from './routes/sucursales';
import { errorHandler, notFoundHandler } from './middleware/error-handler';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Detrás del proxy de Vite (y de un túnel más adelante), para que el rate
  // limit vea la IP real del cliente.
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());

  app.use(`${API_PREFIX}/health`, healthRouter);
  app.use(`${API_PREFIX}/auth`, authRouter);
  app.use(`${API_PREFIX}/sucursales`, sucursalesRouter);
  app.use(`${API_PREFIX}/roles`, rolesRouter);
  app.use(`${API_PREFIX}/personal`, personalRouter);
  app.use(`${API_PREFIX}/insumos`, insumosRouter);
  app.use(`${API_PREFIX}/recetas`, recetasRouter);
  app.use(`${API_PREFIX}/categorias`, categoriasRouter);
  app.use(`${API_PREFIX}/platos`, platosRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
