import { Router } from 'express';
import { idParamSchema, insumoInputSchema, type InsumoInput } from '@pgim/shared';
import { autenticar, requierePermiso, tenant, validar, validarParams } from '../middleware/auth';
import { insumoService } from '../services/insumo.service';

export const insumosRouter = Router();

insumosRouter.use(autenticar, tenant);

insumosRouter.get('/', requierePermiso('insumo.ver'), async (req, res) => {
  const { restauranteId, sucursalId } = req.tenant!;
  res.json(await insumoService.listar(restauranteId, sucursalId));
});

insumosRouter.post(
  '/',
  requierePermiso('insumo.crear'),
  validar(insumoInputSchema),
  async (req, res) => {
    res
      .status(201)
      .json(await insumoService.crear(req.tenant!.restauranteId, req.body as InsumoInput));
  },
);

insumosRouter.put(
  '/:id',
  requierePermiso('insumo.editar'),
  validarParams(idParamSchema),
  validar(insumoInputSchema),
  async (req, res) => {
    res.json(
      await insumoService.actualizar(
        req.tenant!.restauranteId,
        req.params.id as string,
        req.body as InsumoInput,
      ),
    );
  },
);

insumosRouter.delete(
  '/:id',
  requierePermiso('insumo.eliminar'),
  validarParams(idParamSchema),
  async (req, res) => {
    await insumoService.desactivar(req.tenant!.restauranteId, req.params.id as string);
    res.status(204).end();
  },
);
