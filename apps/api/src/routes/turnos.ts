import { Router } from 'express';
import { fechaDe } from '../domain/franjas';
import { autenticar, requierePermiso, tenant } from '../middleware/auth';
import { planificacionRepository } from '../repositories/planificacion.repository';

// Turnos propios del empleado (CU-09): solo los de planificaciones confirmadas.
export const turnosRouter = Router();

turnosRouter.use(autenticar, tenant);

turnosRouter.get('/mios', requierePermiso('turno.ver'), async (req, res) => {
  res.json(
    await planificacionRepository.turnosDe(
      req.tenant!.restauranteId,
      req.sesion!.usuario.id,
      fechaDe(new Date()),
    ),
  );
});
