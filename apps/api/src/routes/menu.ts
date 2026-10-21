import { Router } from 'express';
import {
  categoriaInputSchema,
  idParamSchema,
  platoInputSchema,
  type CategoriaInput,
  type PlatoInput,
} from '@pgim/shared';
import { autenticar, requierePermiso, tenant, validar, validarParams } from '../middleware/auth';
import { menuService } from '../services/menu.service';

// Categorías y platos comparten los permisos menu.* (el Jefe de cocina tiene el ABM completo).

export const categoriasRouter = Router();

categoriasRouter.use(autenticar, tenant);

categoriasRouter.get('/', requierePermiso('menu.ver'), async (req, res) => {
  res.json(await menuService.listarCategorias(req.tenant!.restauranteId));
});

categoriasRouter.post(
  '/',
  requierePermiso('menu.crear'),
  validar(categoriaInputSchema),
  async (req, res) => {
    res
      .status(201)
      .json(
        await menuService.crearCategoria(req.tenant!.restauranteId, req.body as CategoriaInput),
      );
  },
);

categoriasRouter.put(
  '/:id',
  requierePermiso('menu.editar'),
  validarParams(idParamSchema),
  validar(categoriaInputSchema),
  async (req, res) => {
    res.json(
      await menuService.actualizarCategoria(
        req.tenant!.restauranteId,
        req.params.id as string,
        req.body as CategoriaInput,
      ),
    );
  },
);

categoriasRouter.delete(
  '/:id',
  requierePermiso('menu.eliminar'),
  validarParams(idParamSchema),
  async (req, res) => {
    await menuService.borrarCategoria(req.tenant!.restauranteId, req.params.id as string);
    res.status(204).end();
  },
);

export const platosRouter = Router();

platosRouter.use(autenticar, tenant);

platosRouter.get('/', requierePermiso('menu.ver'), async (req, res) => {
  res.json(await menuService.listarPlatos(req.tenant!.restauranteId));
});

platosRouter.post(
  '/',
  requierePermiso('menu.crear'),
  validar(platoInputSchema),
  async (req, res) => {
    res
      .status(201)
      .json(await menuService.crearPlato(req.tenant!.restauranteId, req.body as PlatoInput));
  },
);

platosRouter.put(
  '/:id',
  requierePermiso('menu.editar'),
  validarParams(idParamSchema),
  validar(platoInputSchema),
  async (req, res) => {
    res.json(
      await menuService.actualizarPlato(
        req.tenant!.restauranteId,
        req.params.id as string,
        req.body as PlatoInput,
      ),
    );
  },
);

platosRouter.delete(
  '/:id',
  requierePermiso('menu.eliminar'),
  validarParams(idParamSchema),
  async (req, res) => {
    await menuService.desactivarPlato(req.tenant!.restauranteId, req.params.id as string);
    res.status(204).end();
  },
);
