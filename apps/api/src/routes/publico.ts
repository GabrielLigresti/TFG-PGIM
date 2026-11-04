import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { busquedaQuerySchema, idParamSchema } from '@pgim/shared';
import { validarParams } from '../middleware/auth';
import { publicoService } from '../services/publico.service';

// Lo que ve cualquier visitante: sin sesión. Solo lectura de datos públicos.
export const publicoRouter = Router();

// La búsqueda cruza restaurantes y no pide sesión: se limita por IP.
const limitePublico = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Probá de nuevo en un minuto.' },
});

publicoRouter.use(limitePublico);

publicoRouter.get('/buscar', async (req, res) => {
  const { q, barrio } = busquedaQuerySchema.parse(req.query);
  res.json(await publicoService.buscar(q, barrio));
});

publicoRouter.get('/barrios', async (_req, res) => {
  res.json(await publicoService.barrios());
});

publicoRouter.get('/sucursales/:id/menu', validarParams(idParamSchema), async (req, res) => {
  res.json(await publicoService.obtenerMenu(req.params.id as string));
});

const platoParamsSchema = z.object({ sucursalId: z.uuid(), id: z.uuid() });

publicoRouter.get(
  '/sucursales/:sucursalId/platos/:id',
  validarParams(platoParamsSchema),
  async (req, res) => {
    res.json(
      await publicoService.obtenerPlato(req.params.sucursalId as string, req.params.id as string),
    );
  },
);
