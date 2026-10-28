import { Router } from 'express';
import { z } from 'zod';
import { obtenerCobro } from '../pagos/mercado-pago';
import { verificarFirma } from '../pagos/firma';
import { configMercadoPago } from '../pagos/pasarela';
import type { ResultadoCobroPago } from '../repositories/pago.repository';
import { pagoService } from '../services/pago.service';

// Notificaciones de Mercado Pago (sin sesión ni tenant). Se verifica la firma
// y el cobro se consulta a Mercado Pago por su id: el cuerpo no es fuente.
// Solo aprueba: un intento rechazado no cierra el pago, porque Checkout Pro
// deja reintentar con otro medio; el rechazo lo decide el vencimiento.

export interface DepsWebhook {
  verificar(firma: {
    encabezado: string | undefined;
    requestId: string | undefined;
    dataId: string;
  }): boolean;
  obtener: (idCobro: string) => ReturnType<typeof obtenerCobro>;
  resolver(pagoId: string, resultado: ResultadoCobroPago): Promise<void>;
}

const esUuid = (valor: string | null) => valor !== null && z.uuid().safeParse(valor).success;

const texto = (valor: unknown) => (typeof valor === 'string' ? valor : undefined);

export function createPagosWebhookRouter(deps: DepsWebhook | null): Router {
  const router = Router();

  router.post('/mercadopago', async (req, res) => {
    if (!deps) {
      res.status(404).end();
      return;
    }
    const tipo = texto(req.query.type) ?? texto(req.body?.type);
    const dataId = texto(req.query['data.id']) ?? String(req.body?.data?.id ?? '');
    // Las órdenes y otros avisos no cambian nada en PGIM.
    if (tipo !== 'payment' || !dataId) {
      res.status(200).end();
      return;
    }
    if (
      !deps.verificar({
        encabezado: req.get('x-signature'),
        requestId: req.get('x-request-id'),
        dataId,
      })
    ) {
      res.status(401).end();
      return;
    }

    const cobro = await deps.obtener(dataId);
    if (cobro.estado === 'APROBADO' && esUuid(cobro.pagoId)) {
      // Si falla, el error llega al errorHandler (500) y Mercado Pago reintenta.
      await deps.resolver(cobro.pagoId!, {
        estado: 'APROBADO',
        referenciaExterna: cobro.referenciaExterna,
        metodo: cobro.metodo,
      });
    }
    res.status(200).end();
  });

  return router;
}

export const pagosWebhookRouter = createPagosWebhookRouter(
  configMercadoPago && {
    verificar: (firma) => verificarFirma({ ...firma, secreto: configMercadoPago!.webhookSecret }),
    obtener: (idCobro) => obtenerCobro(configMercadoPago!, idCobro),
    resolver: (pagoId, resultado) => pagoService.resolver(pagoId, resultado),
  },
);
