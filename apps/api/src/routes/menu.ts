import express, { Router } from 'express';
import { z } from 'zod';
import {
  LIMITE_MODELO_MB,
  categoriaInputSchema,
  idParamSchema,
  menuInputSchema,
  modeloRaInputSchema,
  platoInputSchema,
  type CategoriaInput,
  type MenuInput,
  type ModeloRaInput,
  type PlatoInput,
} from '@pgim/shared';
import { autenticar, requierePermiso, tenant, validar, validarParams } from '../middleware/auth';
import { menuService } from '../services/menu.service';

// Categorías, platos y menús comparten los permisos menu.* (el Jefe de cocina tiene el ABM completo).

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

// Modelo RA del plato (CU-16). Los archivos llegan como cuerpo binario, sin
// multipart; el .glb trae la escala y la porción en la query.
const archivoModelo = express.raw({
  type: 'application/octet-stream',
  limit: `${LIMITE_MODELO_MB}mb`,
});

const modeloParamsSchema = idParamSchema.extend({ formato: z.enum(['glb', 'usdz']) });

const modeloQuerySchema = z.object({
  escalaReal: z.coerce.number(),
  porcionGramos: z.coerce.number(),
});

platosRouter.put(
  '/:id/modelo-ra/:formato',
  requierePermiso('menu.editar'),
  validarParams(modeloParamsSchema),
  archivoModelo,
  async (req, res) => {
    const { id, formato } = modeloParamsSchema.parse(req.params);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'Falta el archivo del modelo' });
      return;
    }
    const datos =
      formato === 'glb' ? modeloRaInputSchema.parse(modeloQuerySchema.parse(req.query)) : undefined;
    res.json(
      await menuService.subirModelo(req.tenant!.restauranteId, id, formato, req.body, datos),
    );
  },
);

platosRouter.put(
  '/:id/modelo-ra',
  requierePermiso('menu.editar'),
  validarParams(idParamSchema),
  validar(modeloRaInputSchema),
  async (req, res) => {
    res.json(
      await menuService.actualizarDatosModelo(
        req.tenant!.restauranteId,
        req.params.id as string,
        req.body as ModeloRaInput,
      ),
    );
  },
);

platosRouter.delete(
  '/:id/modelo-ra',
  requierePermiso('menu.editar'),
  validarParams(idParamSchema),
  async (req, res) => {
    await menuService.quitarModelo(req.tenant!.restauranteId, req.params.id as string);
    res.status(204).end();
  },
);

export const menusRouter = Router();

menusRouter.use(autenticar, tenant);

menusRouter.get('/', requierePermiso('menu.ver'), async (req, res) => {
  res.json(await menuService.listarMenus(req.tenant!.restauranteId));
});

menusRouter.post('/', requierePermiso('menu.crear'), validar(menuInputSchema), async (req, res) => {
  res
    .status(201)
    .json(await menuService.crearMenu(req.tenant!.restauranteId, req.body as MenuInput));
});

menusRouter.put(
  '/:id',
  requierePermiso('menu.editar'),
  validarParams(idParamSchema),
  validar(menuInputSchema),
  async (req, res) => {
    res.json(
      await menuService.actualizarMenu(
        req.tenant!.restauranteId,
        req.params.id as string,
        req.body as MenuInput,
      ),
    );
  },
);

menusRouter.delete(
  '/:id',
  requierePermiso('menu.eliminar'),
  validarParams(idParamSchema),
  async (req, res) => {
    await menuService.borrarMenu(req.tenant!.restauranteId, req.params.id as string);
    res.status(204).end();
  },
);
