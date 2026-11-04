import { Router } from 'express';
import { configuracionAperturaSchema, idParamSchema } from '@pgim/shared';
import { autenticar, requierePermiso, tenant, validar, validarParams } from '../middleware/auth';
import { aperturaService } from '../services/apertura.service';
import { sucursalDeTrabajo } from './reservas';

// Asistente de apertura (CU-09): pronóstico semanal y su configuración.
export const aperturaRouter = Router();

aperturaRouter.use(autenticar, tenant);

const deTrabajo = (req: Parameters<typeof sucursalDeTrabajo>[0]) => ({
  restauranteId: req.tenant!.restauranteId,
  sucursalId: sucursalDeTrabajo(req),
});

aperturaRouter.get('/pronostico', requierePermiso('apertura.consultar'), async (req, res) => {
  res.json(await aperturaService.obtenerAsistente(deTrabajo(req), new Date()));
});

aperturaRouter.post(
  '/pronostico/regenerar',
  requierePermiso('turno.planificar'),
  async (req, res) => {
    res.json(await aperturaService.regenerar(deTrabajo(req), new Date()));
  },
);

aperturaRouter.post(
  '/planificacion/:id/confirmar',
  requierePermiso('turno.planificar'),
  validarParams(idParamSchema),
  async (req, res) => {
    res.json(await aperturaService.confirmar(deTrabajo(req), req.params.id as string, new Date()));
  },
);

aperturaRouter.get('/configuracion', requierePermiso('apertura.consultar'), async (req, res) => {
  res.json(await aperturaService.obtenerConfiguracion(deTrabajo(req)));
});

aperturaRouter.put(
  '/configuracion',
  requierePermiso('apertura.consultar'),
  validar(configuracionAperturaSchema),
  async (req, res) => {
    res.json(await aperturaService.actualizarConfiguracion(deTrabajo(req), req.body));
  },
);
