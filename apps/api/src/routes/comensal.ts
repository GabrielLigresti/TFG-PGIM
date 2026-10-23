import { Router } from 'express';
import { z } from 'zod';
import { idParamSchema } from '@pgim/shared';
import { autenticar, soloTipo, validarParams } from '../middleware/auth';
import { comensalService } from '../services/comensal.service';

// Menú para el comensal: es privado (hace falta sesión de comensal).
export const comensalRouter = Router();

comensalRouter.use(autenticar, soloTipo('COMENSAL'));

comensalRouter.get('/sucursales', async (_req, res) => {
  res.json(await comensalService.listarSucursales());
});

comensalRouter.get('/sucursales/:id/menu', validarParams(idParamSchema), async (req, res) => {
  res.json(await comensalService.obtenerMenu(req.params.id as string));
});

const platoParamsSchema = z.object({ sucursalId: z.uuid(), id: z.uuid() });

comensalRouter.get(
  '/sucursales/:sucursalId/platos/:id',
  validarParams(platoParamsSchema),
  async (req, res) => {
    res.json(
      await comensalService.obtenerPlato(req.params.sucursalId as string, req.params.id as string),
    );
  },
);
