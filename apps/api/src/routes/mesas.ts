import { Router } from 'express';
import { z } from 'zod';
import { mesaInputSchema, type MesaInput } from '@pgim/shared';
import { autenticar, requierePermiso, tenant, validar, validarParams } from '../middleware/auth';
import { mesaService } from '../services/mesa.service';

// CU-14: el salón se ve con sucursal.ver y se edita con sucursal.editar.
export const mesasRouter = Router({ mergeParams: true });

const sucursalParamSchema = z.object({ sucursalId: z.uuid() });
const mesaParamSchema = sucursalParamSchema.extend({ id: z.uuid() });

mesasRouter.use(autenticar, tenant);

mesasRouter.get(
  '/',
  requierePermiso('sucursal.ver'),
  validarParams(sucursalParamSchema),
  async (req, res) => {
    const { permisos, sucursales } = req.sesion!;
    res.json(
      await mesaService.listar(
        req.tenant!.restauranteId,
        permisos,
        sucursales.map((s) => s.id),
        req.params.sucursalId as string,
      ),
    );
  },
);

mesasRouter.post(
  '/',
  requierePermiso('sucursal.editar'),
  validarParams(sucursalParamSchema),
  validar(mesaInputSchema),
  async (req, res) => {
    const mesa = await mesaService.crear(
      req.tenant!.restauranteId,
      req.params.sucursalId as string,
      req.body as MesaInput,
    );
    res.status(201).json(mesa);
  },
);

mesasRouter.put(
  '/:id',
  requierePermiso('sucursal.editar'),
  validarParams(mesaParamSchema),
  validar(mesaInputSchema),
  async (req, res) => {
    res.json(
      await mesaService.actualizar(
        req.tenant!.restauranteId,
        req.params.sucursalId as string,
        req.params.id as string,
        req.body as MesaInput,
      ),
    );
  },
);

mesasRouter.delete(
  '/:id',
  requierePermiso('sucursal.editar'),
  validarParams(mesaParamSchema),
  async (req, res) => {
    await mesaService.desactivar(
      req.tenant!.restauranteId,
      req.params.sucursalId as string,
      req.params.id as string,
    );
    res.status(204).end();
  },
);
