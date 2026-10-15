import express from 'express';
import { API_PREFIX } from '@pgim/shared';
import { healthRouter } from './routes/health';
import { errorHandler, notFoundHandler } from './middleware/error-handler';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  app.use(`${API_PREFIX}/health`, healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
