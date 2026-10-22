import { Router } from 'express';
import { idParamSchema, rolInputSchema, type RolInput } from '@pgim/shared';
import { autenticar, requierePermiso, tenant, validar, validarParams } from '../middleware/auth';
import { rolService } from '../services/rol.service';

export const rolesRouter = Router();

rolesRouter.use(autenticar, tenant);

rolesRouter.get('/', requierePermiso('rol.ver'), async (req, res) => {
  res.json(await rolService.listar(req.tenant!.restauranteId));
});

rolesRouter.get('/permisos', requierePermiso('rol.ver'), (_req, res) => {
  res.json(rolService.permisosPorModulo());
});

rolesRouter.post('/', requierePermiso('rol.crear'), validar(rolInputSchema), async (req, res) => {
  res.status(201).json(await rolService.crear(req.tenant!.restauranteId, req.body as RolInput));
});

rolesRouter.put(
  '/:id',
  requierePermiso('rol.editar'),
  validarParams(idParamSchema),
  validar(rolInputSchema),
  async (req, res) => {
    res.json(
      await rolService.actualizar(
        req.tenant!.restauranteId,
        req.params.id as string,
        req.body as RolInput,
      ),
    );
  },
);

rolesRouter.delete(
  '/:id',
  requierePermiso('rol.eliminar'),
  validarParams(idParamSchema),
  async (req, res) => {
    await rolService.desactivar(req.tenant!.restauranteId, req.params.id as string);
    res.status(204).end();
  },
);
