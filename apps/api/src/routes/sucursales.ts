import { Router } from 'express';
import { idParamSchema, sucursalInputSchema, type SucursalInput } from '@pgim/shared';
import { autenticar, requierePermiso, tenant, validar, validarParams } from '../middleware/auth';
import { sucursalService } from '../services/sucursal.service';

export const sucursalesRouter = Router();

sucursalesRouter.use(autenticar, tenant);

sucursalesRouter.get('/', requierePermiso('sucursal.ver'), async (req, res) => {
  res.json(await sucursalService.listar(req.tenant!.restauranteId));
});

sucursalesRouter.post(
  '/',
  requierePermiso('sucursal.crear'),
  validar(sucursalInputSchema),
  async (req, res) => {
    const sucursal = await sucursalService.crear(
      req.tenant!.restauranteId,
      req.sesion!.usuario.id,
      req.body as SucursalInput,
    );
    res.status(201).json(sucursal);
  },
);

sucursalesRouter.put(
  '/:id',
  requierePermiso('sucursal.editar'),
  validarParams(idParamSchema),
  validar(sucursalInputSchema),
  async (req, res) => {
    res.json(
      await sucursalService.actualizar(
        req.tenant!.restauranteId,
        req.params.id as string,
        req.body as SucursalInput,
      ),
    );
  },
);

sucursalesRouter.delete(
  '/:id',
  requierePermiso('sucursal.eliminar'),
  validarParams(idParamSchema),
  async (req, res) => {
    await sucursalService.desactivar(req.tenant!.restauranteId, req.params.id as string);
    res.status(204).end();
  },
);
