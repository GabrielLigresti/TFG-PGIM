import { Router } from 'express';
import {
  consultaFranjasSchema,
  consultaMapaSchema,
  idParamSchema,
  reservaInputSchema,
  type ReservaInput,
} from '@pgim/shared';
import { validar, validarParams } from '../middleware/auth';
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
