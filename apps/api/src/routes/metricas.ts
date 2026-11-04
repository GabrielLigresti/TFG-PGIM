import { Router } from 'express';
import { consultaMetricasSchema } from '@pgim/shared';
import { autenticar, requierePermiso, tenant } from '../middleware/auth';
import { metricaService } from '../services/metrica.service';

// Métricas por sucursal y período (CU-19).
export const metricasRouter = Router();

metricasRouter.use(autenticar, tenant);

metricasRouter.get('/', requierePermiso('metrica.ver'), async (req, res) => {
  const consulta = consultaMetricasSchema.parse(req.query);
  res.json(
    await metricaService.consultar(
      {
        restauranteId: req.tenant!.restauranteId,
        permisos: req.sesion!.permisos,
        sucursales: req.sesion!.sucursales,
      },
      consulta,
      new Date(),
    ),
  );
});
