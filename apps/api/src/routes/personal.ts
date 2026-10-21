import { Router } from 'express';
import {
  empleadoAltaSchema,
  empleadoEdicionSchema,
  idParamSchema,
  type EmpleadoAlta,
  type EmpleadoEdicion,
} from '@pgim/shared';
import { autenticar, requierePermiso, tenant, validar, validarParams } from '../middleware/auth';
import { personalService } from '../services/personal.service';

export const personalRouter = Router();

personalRouter.use(autenticar, tenant);

personalRouter.get('/', requierePermiso('personal.ver'), async (req, res) => {
  res.json(await personalService.listar(req.tenant!.restauranteId));
});

personalRouter.get('/opciones', requierePermiso('personal.ver'), async (req, res) => {
  res.json(await personalService.opciones(req.tenant!.restauranteId));
});

personalRouter.post(
  '/',
  requierePermiso('personal.crear'),
  validar(empleadoAltaSchema),
  async (req, res) => {
    const empleado = await personalService.crear(
      req.tenant!.restauranteId,
      req.body as EmpleadoAlta,
    );
    res.status(201).json(empleado);
  },
);

personalRouter.put(
  '/:id',
  requierePermiso('personal.editar'),
  validarParams(idParamSchema),
  validar(empleadoEdicionSchema),
  async (req, res) => {
    res.json(
      await personalService.actualizar(
        req.tenant!.restauranteId,
        req.sesion!.usuario.id,
        req.params.id as string,
        req.body as EmpleadoEdicion,
      ),
    );
  },
);

personalRouter.delete(
  '/:id',
  requierePermiso('personal.eliminar'),
  validarParams(idParamSchema),
  async (req, res) => {
    await personalService.desactivar(
      req.tenant!.restauranteId,
      req.sesion!.usuario.id,
      req.params.id as string,
    );
    res.status(204).end();
  },
);
