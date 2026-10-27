import { Router } from 'express';
import { pedidoInputSchema, type PedidoInput } from '@pgim/shared';
import { validar } from '../middleware/auth';
import { pedidoService } from '../services/pedido.service';

// CU-04 del lado del comensal: pedidos de su mesa. Se monta con
// autenticar → soloTipo('COMENSAL').
export const mesaComensalRouter = Router();

mesaComensalRouter.post('/pedidos', validar(pedidoInputSchema), async (req, res) => {
  const pedido = await pedidoService.confirmar(req.sesion!.usuario.id, req.body as PedidoInput);
  res.status(201).json(pedido);
});
