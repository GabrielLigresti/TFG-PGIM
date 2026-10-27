import { Router } from 'express';
import { cancelarPedidoSchema, idParamSchema } from '@pgim/shared';
import { autenticar, requierePermiso, tenant, validar, validarParams } from '../middleware/auth';
import { pedidoService } from '../services/pedido.service';
import { sucursalDeTrabajo } from './reservas';

// CU-05 Gestionar cola de pedidos, en la sucursal de trabajo. El permiso de
// cada transición (preparar o entregar) lo comprueba el servicio.
export const pedidosRouter = Router();

pedidosRouter.use(autenticar, tenant, requierePermiso('pedido.ver'));

pedidosRouter.get('/cola', async (req, res) => {
  res.json(await pedidoService.cola(req.tenant!.restauranteId, sucursalDeTrabajo(req)));
});

pedidosRouter.post('/:id/avanzar', validarParams(idParamSchema), async (req, res) => {
  res.json(
    await pedidoService.avanzar(
      req.tenant!.restauranteId,
      sucursalDeTrabajo(req),
      req.sesion!.permisos,
      req.params.id as string,
    ),
  );
});

pedidosRouter.post(
  '/:id/cancelar',
  validarParams(idParamSchema),
  validar(cancelarPedidoSchema),
  async (req, res) => {
    res.json(
      await pedidoService.cancelar(
        req.tenant!.restauranteId,
        sucursalDeTrabajo(req),
        req.sesion!.permisos,
        req.params.id as string,
        (req.body as { motivo: string }).motivo,
      ),
    );
  },
);
