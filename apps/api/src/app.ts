import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { API_PREFIX } from '@pgim/shared';
import { alertasRouter } from './routes/alertas';
import { aperturaRouter } from './routes/apertura';
import { authRouter } from './routes/auth';
import { cuentaRouter } from './routes/cuenta';
import { escaneosRouter } from './routes/escaneos';
import { fidelizacionRouter } from './routes/fidelizacion';
import { healthRouter } from './routes/health';
import { insumosRouter } from './routes/insumos';
import { stockRouter } from './routes/stock';
import { mesaComensalRouter } from './routes/mesa-comensal';
import { mesasRouter } from './routes/mesas';
import { metricasRouter } from './routes/metricas';
import { categoriasRouter, menusRouter, platosRouter } from './routes/menu';
import { pagosWebhookRouter } from './routes/pagos-webhook';
import { pedidosRouter } from './routes/pedidos';
import { personalRouter } from './routes/personal';
import { publicoRouter } from './routes/publico';
import { recetasRouter } from './routes/recetas';
import { reservasComensalRouter, reservasPanelRouter } from './routes/reservas';
import { rolesRouter } from './routes/roles';
import { salonRouter } from './routes/salon';
import { sucursalesRouter } from './routes/sucursales';
import { turnosRouter } from './routes/turnos';
import { CARPETA_FOTOS, TIPO_FOTO } from './lib/archivos-foto';
import { CARPETA_MODELOS } from './lib/archivos-modelo';
import { autenticar, soloTipo } from './middleware/auth';
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

  // Fotos de platos subidas, con el mismo cuidado que los modelos.
  app.use(
    `${API_PREFIX}/uploads/fotos`,
    express.static(CARPETA_FOTOS, {
      index: false,
      redirect: false,
      dotfiles: 'deny',
      immutable: true,
      maxAge: '1y',
      setHeaders(res, ruta) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Type', TIPO_FOTO[path.extname(ruta)] ?? 'application/octet-stream');
      },
    }),
  );

  app.use(`${API_PREFIX}/health`, healthRouter);
  app.use(`${API_PREFIX}/auth`, authRouter);
  app.use(`${API_PREFIX}/cuenta`, cuentaRouter);
  app.use(`${API_PREFIX}/sucursales/:sucursalId/mesas`, mesasRouter);
  app.use(`${API_PREFIX}/sucursales`, sucursalesRouter);
  app.use(`${API_PREFIX}/reservas`, reservasPanelRouter);
  app.use(`${API_PREFIX}/salon`, salonRouter);
  app.use(`${API_PREFIX}/pagos/webhook`, pagosWebhookRouter);
  app.use(`${API_PREFIX}/pedidos`, pedidosRouter);
  app.use(`${API_PREFIX}/alertas`, alertasRouter);
  app.use(`${API_PREFIX}/apertura`, aperturaRouter);
  app.use(`${API_PREFIX}/turnos`, turnosRouter);
  app.use(`${API_PREFIX}/metricas`, metricasRouter);
  app.use(`${API_PREFIX}/fidelizacion`, fidelizacionRouter);
  app.use(`${API_PREFIX}/roles`, rolesRouter);
  app.use(`${API_PREFIX}/personal`, personalRouter);
  app.use(`${API_PREFIX}/insumos`, insumosRouter);
  app.use(`${API_PREFIX}/stock`, stockRouter);
  app.use(`${API_PREFIX}/recetas`, recetasRouter);
  app.use(`${API_PREFIX}/categorias`, categoriasRouter);
  app.use(`${API_PREFIX}/platos`, platosRouter);
  app.use(`${API_PREFIX}/escaneos`, escaneosRouter);
  app.use(`${API_PREFIX}/menus`, menusRouter);
  app.use(`${API_PREFIX}/publico`, publicoRouter);
  app.use(`${API_PREFIX}/comensal`, autenticar, soloTipo('COMENSAL'), reservasComensalRouter);
  app.use(`${API_PREFIX}/comensal`, autenticar, soloTipo('COMENSAL'), mesaComensalRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
