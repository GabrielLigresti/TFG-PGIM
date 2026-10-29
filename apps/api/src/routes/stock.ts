import { Router, type Request } from 'express';
import {
  idParamSchema,
  movimientoInputSchema,
  movimientosQuerySchema,
  planTandaQuerySchema,
  tandaInputSchema,
  tandasQuerySchema,
  type MovimientoInput,
  type TandaInput,
} from '@pgim/shared';
import {
  autenticar,
  requiereAlgunPermiso,
  requierePermiso,
  tenant,
  validar,
  validarParams,
} from '../middleware/auth';
import { produccionService } from '../services/produccion.service';
import { stockService } from '../services/stock.service';
import { sucursalDeTrabajo } from './reservas';

export const stockRouter = Router();

stockRouter.use(autenticar, tenant);

const puedeVer = requiereAlgunPermiso('insumo.ver', 'stock.registrar');

function contexto(req: Request) {
  return {
    restauranteId: req.tenant!.restauranteId,
    sucursalId: sucursalDeTrabajo(req),
    empleadoId: req.sesion!.usuario.id,
  };
}

stockRouter.get('/', puedeVer, async (req, res) => {
  res.json(await stockService.listar(req.tenant!.restauranteId, sucursalDeTrabajo(req)));
});

stockRouter.post(
  '/movimientos',
  requierePermiso('stock.registrar'),
  validar(movimientoInputSchema),
  async (req, res) => {
    res.status(201).json(await stockService.registrar(contexto(req), req.body as MovimientoInput));
  },
);

stockRouter.get('/movimientos', puedeVer, async (req, res) => {
  const filtro = movimientosQuerySchema.parse(req.query);
  res.json(
    await stockService.movimientos(req.tenant!.restauranteId, sucursalDeTrabajo(req), filtro),
  );
});

stockRouter.get('/produccion/plan', requierePermiso('stock.registrar'), async (req, res) => {
  const q = planTandaQuerySchema.parse(req.query);
  res.json(await produccionService.plan(req.tenant!.restauranteId, sucursalDeTrabajo(req), q));
});

stockRouter.post(
  '/produccion',
  requierePermiso('stock.registrar'),
  validar(tandaInputSchema),
  async (req, res) => {
    res.status(201).json(await produccionService.registrar(contexto(req), req.body as TandaInput));
  },
);

stockRouter.get('/produccion', puedeVer, async (req, res) => {
  const filtro = tandasQuerySchema.parse(req.query);
  res.json(
    await produccionService.listar(req.tenant!.restauranteId, sucursalDeTrabajo(req), filtro),
  );
});

stockRouter.get('/produccion/:id', puedeVer, validarParams(idParamSchema), async (req, res) => {
  res.json(
    await produccionService.detalle(
      req.tenant!.restauranteId,
      sucursalDeTrabajo(req),
      req.params.id as string,
    ),
  );
});
