import { Router } from 'express';
import {
  consultaMiMesaSchema,
  idParamSchema,
  pagoInputSchema,
  pedidoInputSchema,
  type PagoInput,
  type PedidoInput,
} from '@pgim/shared';
import { validar, validarParams } from '../middleware/auth';
import { beneficiosComensalService } from '../services/beneficios-comensal.service';
import { cuentaMesaService } from '../services/cuenta-mesa.service';
import { pagoService } from '../services/pago.service';
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

// CU-06: siempre por el saldo total, con un beneficio opcional. Responde la URL
// de Mercado Pago, o null si el pago ya quedó resuelto.
mesaComensalRouter.post(
  '/mesa/:id/pagos',
  validarParams(idParamSchema),
  validar(pagoInputSchema),
  async (req, res) => {
    res
      .status(201)
      .json(
        await pagoService.pagar(
          req.sesion!.usuario.id,
          req.params.id as string,
          req.body as PagoInput,
        ),
      );
  },
);

// Estado de un pago del comensal, para cuando vuelve de Mercado Pago y el aviso
// en tiempo real todavía no llegó. No necesita la mesa: puede estar cerrada.
mesaComensalRouter.get('/pagos/:id', validarParams(idParamSchema), async (req, res) => {
  res.json(await pagoService.estado(req.sesion!.usuario.id, req.params.id as string));
});

// Vuelve a abrir Mercado Pago para un pago en curso.
mesaComensalRouter.post('/pagos/:id/continuar', validarParams(idParamSchema), async (req, res) => {
  res.json(await pagoService.continuar(req.sesion!.usuario.id, req.params.id as string));
});

// Beneficios que puede usar al pagar esta mesa y progreso del resto.
mesaComensalRouter.get('/mesa/:id/beneficios', validarParams(idParamSchema), async (req, res) => {
  res.json(await beneficiosComensalService.deMesa(req.sesion!.usuario.id, req.params.id as string));
});

// "Mis puntos": una tarjeta por restaurante donde tiene cuenta de fidelidad.
mesaComensalRouter.get('/fidelidad', async (req, res) => {
  res.json(await beneficiosComensalService.fidelidad(req.sesion!.usuario.id));
});
