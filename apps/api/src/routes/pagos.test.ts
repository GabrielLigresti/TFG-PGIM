import request from 'supertest';
import { createApp } from '../app';
import { firmarToken } from '../lib/jwt';
import { cookieConPermisos } from '../test/sesion-falsa';
import { IDS } from '../test/fake-usuarios';
import { pagosDelDiaRepository } from '../repositories/pagos-del-dia.repository';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));
jest.mock('../repositories/pagos-del-dia.repository', () => ({
  pagosDelDiaRepository: { delDia: jest.fn().mockResolvedValue([]) },
}));

describe('/api/pagos/hoy', () => {
  const app = createApp();

  it('sin sesión responde 401', async () => {
    await request(app).get('/api/pagos/hoy').expect(401);
  });

  it('sin pago.ver responde 403', async () => {
    await request(app)
      .get('/api/pagos/hoy')
      .set('Cookie', cookieConPermisos(['pedido.ver']))
      .expect(403);
  });

  it('con pago.ver responde los pagos de la sucursal de trabajo', async () => {
    const res = await request(app)
      .get('/api/pagos/hoy')
      .set('Cookie', cookieConPermisos(['pago.ver']))
      .expect(200);
    expect(res.body.pagos).toEqual([]);
    expect(res.body.totales.cobrado).toBe(0);
    expect(pagosDelDiaRepository.delDia).toHaveBeenCalledWith(
      IDS.restaurante,
      IDS.centro,
      res.body.fecha,
    );
  });

  it('sin sucursal de trabajo responde 409', async () => {
    cookieConPermisos(['pago.ver']);
    await request(app)
      .get('/api/pagos/hoy')
      .set('Cookie', `sesion=${firmarToken({ usuarioId: IDS.admin })}`)
      .expect(409);
  });

  it('el webhook de Mercado Pago sigue sin pedir sesión', async () => {
    const res = await request(app).post('/api/pagos/webhook/mercadopago');
    expect(res.status).not.toBe(401);
  });
});
