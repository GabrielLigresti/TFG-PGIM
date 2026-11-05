import { Router } from 'express';
import {
  idParamSchema,
  informeCalidadSchema,
  modeloRaInputSchema,
  type InformeCalidad,
  type ModeloRaInput,
} from '@pgim/shared';
import { AppError } from '../lib/errors';
import { autenticar, requierePermiso, tenant, validar, validarParams } from '../middleware/auth';
import { escaneoService } from '../services/escaneo.service';

// El informe viaja en un encabezado (el video ocupa el cuerpo): JSON en UTF-8
// codificado en base64url. Cualquier fallo al leerlo es el mismo 422.
export function leerInformeCalidad(valor: string | undefined): InformeCalidad {
  try {
    if (!valor) throw new Error('sin encabezado');
    const json = Buffer.from(valor, 'base64url').toString('utf8');
    return informeCalidadSchema.parse(JSON.parse(json));
  } catch {
    throw new AppError(422, 'Falta el informe de calidad del video');
  }
}

export const escaneosRouter = Router();

escaneosRouter.use(autenticar, tenant);

escaneosRouter.get('/requisitos', requierePermiso('menu.editar'), (_req, res) => {
  res.json(escaneoService.requisitos());
});

escaneosRouter.post(
  '/:id/publicar',
  requierePermiso('menu.editar'),
  validarParams(idParamSchema),
  validar(modeloRaInputSchema),
  async (req, res) => {
    res.json(
      await escaneoService.publicar(
        req.tenant!.restauranteId,
        req.params.id as string,
        req.body as ModeloRaInput,
      ),
    );
  },
);

escaneosRouter.post(
  '/:id/descartar',
  requierePermiso('menu.editar'),
  validarParams(idParamSchema),
  async (req, res) => {
    res.json(await escaneoService.descartar(req.tenant!.restauranteId, req.params.id as string));
  },
);
