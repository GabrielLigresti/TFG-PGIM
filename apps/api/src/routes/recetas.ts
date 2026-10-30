import { Router } from 'express';
import {
  idParamSchema,
  intermedioAltaSchema,
  llevaStockInputSchema,
  recetaInputSchema,
  type IntermedioAlta,
  type LlevaStockInput,
  type RecetaInput,
} from '@pgim/shared';
import { autenticar, requierePermiso, tenant, validar, validarParams } from '../middleware/auth';
import { recetaService } from '../services/receta.service';

export const recetasRouter = Router();

recetasRouter.use(autenticar, tenant);

recetasRouter.get('/', requierePermiso('receta.ver'), async (req, res) => {
  res.json(await recetaService.listar(req.tenant!.restauranteId));
});

recetasRouter.get('/componentes', requierePermiso('receta.ver'), async (req, res) => {
  res.json(await recetaService.componentes(req.tenant!.restauranteId));
});

recetasRouter.post(
  '/intermedios',
  requierePermiso('receta.crear'),
  validar(intermedioAltaSchema),
  async (req, res) => {
    res
      .status(201)
      .json(
        await recetaService.crearIntermedio(req.tenant!.restauranteId, req.body as IntermedioAlta),
      );
  },
);

// Receta de un plato.
recetasRouter.get(
  '/plato/:id',
  requierePermiso('receta.ver'),
  validarParams(idParamSchema),
  async (req, res) => {
    res.json(
      await recetaService.obtenerDePlato(req.tenant!.restauranteId, req.params.id as string),
    );
  },
);

// El permiso (crear o editar) depende de si el plato ya tiene receta: lo resuelve el servicio.
recetasRouter.put(
  '/plato/:id',
  validarParams(idParamSchema),
  validar(recetaInputSchema),
  async (req, res) => {
    res.json(
      await recetaService.guardarDePlato(
        req.tenant!.restauranteId,
        req.params.id as string,
        req.body as RecetaInput,
        req.sesion!.permisos,
      ),
    );
  },
);

recetasRouter.delete(
  '/plato/:id',
  requierePermiso('receta.eliminar'),
  validarParams(idParamSchema),
  async (req, res) => {
    await recetaService.borrarDePlato(req.tenant!.restauranteId, req.params.id as string);
    res.status(204).end();
  },
);

// Producto intermedio y su receta.
recetasRouter.get(
  '/intermedio/:id',
  requierePermiso('receta.ver'),
  validarParams(idParamSchema),
  async (req, res) => {
    res.json(
      await recetaService.obtenerDeIntermedio(req.tenant!.restauranteId, req.params.id as string),
    );
  },
);

recetasRouter.put(
  '/intermedio/:id',
  validarParams(idParamSchema),
  validar(recetaInputSchema),
  async (req, res) => {
    res.json(
      await recetaService.guardarDeIntermedio(
        req.tenant!.restauranteId,
        req.params.id as string,
        req.body as RecetaInput,
        req.sesion!.permisos,
      ),
    );
  },
);

recetasRouter.put(
  '/intermedio/:id/lleva-stock',
  requierePermiso('receta.editar'),
  validarParams(idParamSchema),
  validar(llevaStockInputSchema),
  async (req, res) => {
    await recetaService.cambiarLlevaStock(
      req.tenant!.restauranteId,
      req.params.id as string,
      (req.body as LlevaStockInput).llevaStock,
    );
    res.status(204).end();
  },
);

recetasRouter.delete(
  '/intermedio/:id',
  requierePermiso('receta.eliminar'),
  validarParams(idParamSchema),
  async (req, res) => {
    await recetaService.desactivarIntermedio(req.tenant!.restauranteId, req.params.id as string);
    res.status(204).end();
  },
);
