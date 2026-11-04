import { Router } from 'express';
import { autenticar, requierePermiso, tenant } from '../middleware/auth';
import { salonService } from '../services/salon.service';
import { sucursalDeTrabajo } from './reservas';

// Salón en vivo del mozo: mesas con su estado actual. Los pedidos solo se
// incluyen si la sesión también puede verlos.
export const salonRouter = Router();

salonRouter.use(autenticar, tenant);

salonRouter.get('/estado', requierePermiso('reserva.ver'), async (req, res) => {
  const incluirPedidos = req.sesion!.permisos.includes('pedido.ver');
  res.json(
    await salonService.estado(req.tenant!.restauranteId, sucursalDeTrabajo(req), incluirPedidos),
  );
});
