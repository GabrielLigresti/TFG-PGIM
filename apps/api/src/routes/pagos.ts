import { Router } from 'express';
import { autenticar, requierePermiso, tenant } from '../middleware/auth';
import { pagosDelDiaService } from '../services/pagos-del-dia.service';
import { sucursalDeTrabajo } from './reservas';

// Pagos del panel (CU-23). Se monta bajo /api/pagos junto al webhook de Mercado
// Pago, que no tiene sesión: por eso la cadena va en cada ruta y no en router.use.
export const pagosRouter = Router();

pagosRouter.get('/hoy', autenticar, tenant, requierePermiso('pago.ver'), async (req, res) => {
  res.json(
    await pagosDelDiaService.delDia(req.tenant!.restauranteId, sucursalDeTrabajo(req), new Date()),
  );
});
