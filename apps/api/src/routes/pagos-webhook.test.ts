import express from 'express';
import request from 'supertest';
import { errorHandler } from '../middleware/error-handler';
import { createPagosWebhookRouter, type DepsWebhook } from './pagos-webhook';

const PAGO = '01900000-0000-7000-8000-0000000000aa';

function armar(cobro: Awaited<ReturnType<DepsWebhook['obtener']>>, firmaValida = true) {
  const deps: jest.Mocked<DepsWebhook> = {
    verificar: jest.fn().mockReturnValue(firmaValida),
    obtener: jest.fn().mockResolvedValue(cobro),
    resolver: jest.fn().mockResolvedValue(undefined),
  };
  const app = express();
  app.use(express.json());
  app.use('/webhook', createPagosWebhookRouter(deps));
  app.use(errorHandler);
  return { app, deps };
}

const aprobado = {
  estado: 'APROBADO' as const,
  pagoId: PAGO,
  referenciaExterna: '123',
  metodo: 'TARJETA' as const,
};

const notificar = (app: express.Express, tipo = 'payment') =>
  request(app)
    .post(`/webhook/mercadopago?data.id=123&type=${tipo}`)
    .set('x-signature', 'ts=1,v1=abc')
    .set('x-request-id', 'req-1')
    .send({ type: tipo, data: { id: '123' } });

describe('webhook de Mercado Pago', () => {
  it('con la firma inválida responde 401 y no consulta a Mercado Pago', async () => {
    const { app, deps } = armar(aprobado, false);
    await notificar(app).expect(401);
    expect(deps.verificar).toHaveBeenCalledWith({
      encabezado: 'ts=1,v1=abc',
      requestId: 'req-1',
      dataId: '123',
    });
    expect(deps.obtener).not.toHaveBeenCalled();
  });

  it('una notificación que no es de un pago se ignora', async () => {
    const { app, deps } = armar(aprobado);
    await notificar(app, 'merchant_order').expect(200);
    expect(deps.obtener).not.toHaveBeenCalled();
  });

  it('un cobro aprobado aprueba el pago con la referencia de Mercado Pago', async () => {
    const { app, deps } = armar(aprobado);
    await notificar(app).expect(200);
    expect(deps.obtener).toHaveBeenCalledWith('123');
    expect(deps.resolver).toHaveBeenCalledWith(PAGO, {
      estado: 'APROBADO',
      referenciaExterna: '123',
      metodo: 'TARJETA',
    });
  });

  it('un cobro rechazado no rechaza el pago: se puede reintentar hasta que venza', async () => {
    const { app, deps } = armar({ ...aprobado, estado: 'SIN_APROBAR' });
    await notificar(app).expect(200);
    expect(deps.resolver).not.toHaveBeenCalled();
  });

  it('una referencia que no es un pago de PGIM se ignora', async () => {
    const { app, deps } = armar({ ...aprobado, pagoId: 'otra-cosa' });
    await notificar(app).expect(200);
    expect(deps.resolver).not.toHaveBeenCalled();
  });

  it('si la aprobación falla responde 500, para que Mercado Pago reintente', async () => {
    const { app, deps } = armar(aprobado);
    deps.resolver.mockRejectedValue(new Error('base caída'));
    await notificar(app).expect(500);
  });

  it('sin Mercado Pago configurado responde 404', async () => {
    const app = express();
    app.use('/webhook', createPagosWebhookRouter(null));
    await request(app).post('/webhook/mercadopago').expect(404);
  });
});
