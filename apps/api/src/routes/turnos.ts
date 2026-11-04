import { Router } from 'express';
import { autenticar, requierePermiso, tenant } from '../middleware/auth';
import { turnoService } from '../services/turno.service';

// Turnos propios del empleado (CU-09): solo los de planificaciones confirmadas.
export const turnosRouter = Router();

turnosRouter.use(autenticar, tenant);

turnosRouter.get('/mios', requierePermiso('turno.ver'), async (req, res) => {
  res.json(
    await turnoService.misTurnos(req.tenant!.restauranteId, req.sesion!.usuario.id, new Date()),
  );
});
