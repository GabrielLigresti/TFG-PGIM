import { Router } from 'express';
import { configuracionAperturaSchema } from '@pgim/shared';
import { autenticar, requierePermiso, tenant, validar } from '../middleware/auth';
import { aperturaService } from '../services/apertura.service';
import { sucursalDeTrabajo } from './reservas';

// Asistente de apertura (CU-09): pronóstico semanal y su configuración.
export const aperturaRouter = Router();

aperturaRouter.use(autenticar, tenant, requierePermiso('apertura.consultar'));

const deTrabajo = (req: Parameters<typeof sucursalDeTrabajo>[0]) => ({
  restauranteId: req.tenant!.restauranteId,
  sucursalId: sucursalDeTrabajo(req),
});

aperturaRouter.get('/pronostico', async (req, res) => {
  res.json(await aperturaService.obtenerAsistente(deTrabajo(req), new Date()));
});

aperturaRouter.post('/pronostico/regenerar', async (req, res) => {
  res.json(await aperturaService.regenerar(deTrabajo(req), new Date()));
});

aperturaRouter.get('/configuracion', async (req, res) => {
  res.json(await aperturaService.obtenerConfiguracion(deTrabajo(req)));
});

aperturaRouter.put('/configuracion', validar(configuracionAperturaSchema), async (req, res) => {
  res.json(await aperturaService.actualizarConfiguracion(deTrabajo(req), req.body));
});
