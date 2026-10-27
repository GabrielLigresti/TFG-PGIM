import { Router } from 'express';
import {
  consultaMiMesaSchema,
  idParamSchema,
  pedidoInputSchema,
  type PedidoInput,
} from '@pgim/shared';
import { validar, validarParams } from '../middleware/auth';
import { cuentaMesaService } from '../services/cuenta-mesa.service';
import { pedidoService } from '../services/pedido.service';

// CU-04 del lado del comensal: pedidos de su mesa, "Mi mesa" y el pago. Se monta con
// autenticar → soloTipo('COMENSAL').
export const mesaComensalRouter = Router();

mesaComensalRouter.post('/pedidos', validar(pedidoInputSchema), async (req, res) => {
  const pedido = await pedidoService.confirmar(req.sesion!.usuario.id, req.body as PedidoInput);
  res.status(201).json(pedido);
});

// La mesa abierta del comensal en esa sucursal (o en cualquiera), o null.
mesaComensalRouter.get('/mesa', async (req, res) => {
  const { sucursalId } = consultaMiMesaSchema.parse(req.query);
  res.json(await cuentaMesaService.miMesa(req.sesion!.usuario.id, sucursalId));
});

mesaComensalRouter.post('/mesa/:id/pagos', validarParams(idParamSchema), async (req, res) => {
  res.json(await cuentaMesaService.pagar(req.sesion!.usuario.id, req.params.id as string));
});
