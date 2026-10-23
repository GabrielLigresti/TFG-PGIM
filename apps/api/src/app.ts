import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { API_PREFIX } from '@pgim/shared';
import { authRouter } from './routes/auth';
import { comensalRouter } from './routes/comensal';
import { healthRouter } from './routes/health';
import { insumosRouter } from './routes/insumos';
import { categoriasRouter, menusRouter, platosRouter } from './routes/menu';
import { personalRouter } from './routes/personal';
import { recetasRouter } from './routes/recetas';
import { rolesRouter } from './routes/roles';
import { sucursalesRouter } from './routes/sucursales';
import { CARPETA_MODELOS } from './lib/archivos-modelo';
import { errorHandler, notFoundHandler } from './middleware/error-handler';

const TIPO_MODELO: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.usdz': 'model/vnd.usdz+zip',
};

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Se confía solo en los proxies locales (Vite y cloudflared): así el rate
  // limit ve la IP real tanto por la red local como por el túnel, y un
  // X-Forwarded-For inventado por el cliente no la reemplaza.
  app.set('trust proxy', 'loopback');
  app.use(express.json());
  app.use(cookieParser());

  // Modelos RA, públicos y con nombre aleatorio (ver lib/archivos-modelo).
  // Sin listado de carpetas, con tipo fijo y nosniff para que el navegador
  // nunca los interprete como una página.
  app.use(
    `${API_PREFIX}/uploads/modelos`,
    express.static(CARPETA_MODELOS, {
      index: false,
      redirect: false,
      dotfiles: 'deny',
      immutable: true,
      maxAge: '1y',
      setHeaders(res, ruta) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader(
          'Content-Type',
          TIPO_MODELO[path.extname(ruta)] ?? 'application/octet-stream',
        );
      },
    }),
  );

  app.use(`${API_PREFIX}/health`, healthRouter);
  app.use(`${API_PREFIX}/auth`, authRouter);
  app.use(`${API_PREFIX}/sucursales`, sucursalesRouter);
  app.use(`${API_PREFIX}/roles`, rolesRouter);
  app.use(`${API_PREFIX}/personal`, personalRouter);
  app.use(`${API_PREFIX}/insumos`, insumosRouter);
  app.use(`${API_PREFIX}/recetas`, recetasRouter);
  app.use(`${API_PREFIX}/categorias`, categoriasRouter);
  app.use(`${API_PREFIX}/platos`, platosRouter);
  app.use(`${API_PREFIX}/menus`, menusRouter);
  app.use(`${API_PREFIX}/comensal`, comensalRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
