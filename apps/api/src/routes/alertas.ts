import { Router } from 'express';
import { idParamSchema } from '@pgim/shared';
import { autenticar, requierePermiso, tenant, validarParams } from '../middleware/auth';
import { alertaService } from '../services/alerta.service';
import { sucursalDeTrabajo } from './reservas';

// Alertas de stock y de platos sin receta (secuencia de CU-04).
export const alertasRouter = Router();

alertasRouter.use(autenticar, tenant, requierePermiso('stock.registrar'));

alertasRouter.get('/', async (req, res) => {
  res.json(await alertaService.sinResolver(req.tenant!.restauranteId, sucursalDeTrabajo(req)));
});

alertasRouter.post('/:id/resolver', validarParams(idParamSchema), async (req, res) => {
  await alertaService.resolver(
    req.tenant!.restauranteId,
    sucursalDeTrabajo(req),
    req.params.id as string,
  );
  res.status(204).end();
});
