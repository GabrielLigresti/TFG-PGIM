import { Router } from 'express';
import { idParamSchema, tiposAlertaVisibles } from '@pgim/shared';
import { autenticar, requiereAlgunPermiso, tenant, validarParams } from '../middleware/auth';
import { alertaService } from '../services/alerta.service';
import { sucursalDeTrabajo } from './reservas';

// Alertas de stock y de platos sin receta (secuencia de CU-04) y de inasistencia (CU-21).
export const alertasRouter = Router();

alertasRouter.use(autenticar, tenant, requiereAlgunPermiso('stock.registrar', 'reserva.ver'));

alertasRouter.get('/', async (req, res) => {
  res.json(
    await alertaService.sinResolver(
      req.tenant!.restauranteId,
      sucursalDeTrabajo(req),
      tiposAlertaVisibles(req.sesion!.permisos),
    ),
  );
});

alertasRouter.post('/:id/resolver', validarParams(idParamSchema), async (req, res) => {
  await alertaService.resolver(
    req.tenant!.restauranteId,
    sucursalDeTrabajo(req),
    req.params.id as string,
    tiposAlertaVisibles(req.sesion!.permisos),
  );
  res.status(204).end();
});
