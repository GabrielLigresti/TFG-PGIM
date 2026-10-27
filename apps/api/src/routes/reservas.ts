import { Router, type Request } from 'express';
import {
  cerrarMesaSchema,
  consultaFranjasSchema,
  consultaMapaSchema,
  consultaReservasPanelSchema,
  idParamSchema,
  reservaInputSchema,
  type ReservaInput,
} from '@pgim/shared';
import { AppError } from '../lib/errors';
import { autenticar, requierePermiso, tenant, validar, validarParams } from '../middleware/auth';
import { reservaService } from '../services/reserva.service';

// CU-03 del lado del comensal. Se monta con autenticar → soloTipo('COMENSAL').
export const reservasComensalRouter = Router();

reservasComensalRouter.get(
  '/sucursales/:id/franjas',
  validarParams(idParamSchema),
  async (req, res) => {
    const { fecha, personas } = consultaFranjasSchema.parse(req.query);
    res.json(await reservaService.franjasDisponibles(req.params.id as string, fecha, personas));
  },
);

reservasComensalRouter.get(
  '/sucursales/:id/mapa',
  validarParams(idParamSchema),
  async (req, res) => {
    const { inicio, personas } = consultaMapaSchema.parse(req.query);
    res.json(await reservaService.mapa(req.params.id as string, new Date(inicio), personas));
  },
);

reservasComensalRouter.post('/reservas', validar(reservaInputSchema), async (req, res) => {
  const reserva = await reservaService.reservar(req.sesion!.usuario.id, req.body as ReservaInput);
  res.status(201).json(reserva);
});

reservasComensalRouter.get('/reservas', async (req, res) => {
  res.json(await reservaService.misReservas(req.sesion!.usuario.id));
});

reservasComensalRouter.post(
  '/reservas/:id/cancelar',
  validarParams(idParamSchema),
  async (req, res) => {
    res.json(await reservaService.cancelar(req.sesion!.usuario.id, req.params.id as string));
  },
);

// CU-12 del lado del personal: reservas de la sucursal de trabajo.
export const reservasPanelRouter = Router();

reservasPanelRouter.use(autenticar, tenant);

export function sucursalDeTrabajo(req: Request): string {
  const { sucursalId } = req.tenant!;
  if (!sucursalId) throw new AppError(409, 'Elegí una sucursal de trabajo');
  return sucursalId;
}

reservasPanelRouter.get('/', requierePermiso('reserva.ver'), async (req, res) => {
  const { fecha } = consultaReservasPanelSchema.parse(req.query);
  res.json(await reservaService.delDia(req.tenant!.restauranteId, sucursalDeTrabajo(req), fecha));
});

reservasPanelRouter.post(
  '/:id/activar',
  requierePermiso('reserva.activar'),
  validarParams(idParamSchema),
  async (req, res) => {
    res.json(
      await reservaService.activar(
        req.tenant!.restauranteId,
        sucursalDeTrabajo(req),
        req.params.id as string,
      ),
    );
  },
);

// CU-18 Cerrar mesa.
reservasPanelRouter.post(
  '/:id/cerrar',
  requierePermiso('mesa.cerrar'),
  validarParams(idParamSchema),
  validar(cerrarMesaSchema),
  async (req, res) => {
    const { confirmarSaldo } = req.body as { confirmarSaldo?: boolean };
    res.json(
      await reservaService.cerrar(
        req.tenant!.restauranteId,
        sucursalDeTrabajo(req),
        req.params.id as string,
        confirmarSaldo ?? false,
      ),
    );
  },
);

// El staff cancela una reserva pendiente (por ejemplo, avisaron que no vienen).
reservasPanelRouter.post(
  '/:id/cancelar',
  requierePermiso('reserva.activar'),
  validarParams(idParamSchema),
  async (req, res) => {
    res.json(
      await reservaService.cancelarDesdePanel(
        req.tenant!.restauranteId,
        sucursalDeTrabajo(req),
        req.params.id as string,
      ),
    );
  },
);
