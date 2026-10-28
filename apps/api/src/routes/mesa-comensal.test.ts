import request from 'supertest';
import { createApp } from '../app';
import { IDS } from '../test/fake-usuarios';
import { cookieConPermisos, cookieDeComensal } from '../test/sesion-falsa';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

jest.mock('../services/pago.service', () => ({
  pagoService: {
    pagar: jest.fn().mockResolvedValue({ pagoId: 'p1', urlPago: 'https://mp/pagar' }),
    estado: jest.fn().mockResolvedValue({ pagoId: 'p1', estado: 'PENDIENTE' }),
    continuar: jest.fn().mockResolvedValue({ pagoId: 'p1', urlPago: 'https://mp/pagar' }),
    urlDePago: jest.fn().mockReturnValue(null),
  },
}));

jest.mock('../services/beneficios-comensal.service', () => ({
  beneficiosComensalService: { deMesa: jest.fn(), fidelidad: jest.fn().mockResolvedValue([]) },
}));

const CUENTA = '01900000-0000-7000-8000-000000000061';
const PLATO = '01900000-0000-7000-8000-000000000071';

describe('/api/comensal/pedidos', () => {
  const app = createApp();
  const pedido = {
    cuentaMesaId: CUENTA,
    lineas: [{ itemMenuId: PLATO, cantidad: 1, observaciones: null }],
  };

  it('sin cookie responde 401', async () => {
    await request(app).post('/api/comensal/pedidos').send(pedido).expect(401);
  });

  it('el personal no puede pedir como comensal', async () => {
    await request(app)
      .post('/api/comensal/pedidos')
      .set('Cookie', cookieConPermisos(['pedido.ver']))
      .send(pedido)
      .expect(403);
  });

  it('una cantidad de 0 responde 400', async () => {
    await request(app)
      .post('/api/comensal/pedidos')
      .set('Cookie', cookieDeComensal())
      .send({ ...pedido, lineas: [{ itemMenuId: PLATO, cantidad: 0, observaciones: null }] })
      .expect(400);
  });
});

describe('/api/comensal/mesa', () => {
  const app = createApp();

  it('un sucursalId inválido responde 400', async () => {
    await request(app)
      .get('/api/comensal/mesa?sucursalId=centro')
      .set('Cookie', cookieDeComensal())
      .expect(400);
  });

  it('pagar con un id inválido responde 400', async () => {
    await request(app)
      .post('/api/comensal/mesa/no-es-uuid/pagos')
      .set('Cookie', cookieDeComensal())
      .expect(400);
  });

  it('pagar con un beneficio inválido responde 400', async () => {
    await request(app)
      .post(`/api/comensal/mesa/${CUENTA}/pagos`)
      .set('Cookie', cookieDeComensal())
      .send({ beneficioId: 'no-es-uuid' })
      .expect(400);
  });

  it('paga como el comensal de la sesión y devuelve la URL de Mercado Pago', async () => {
    const { pagoService } = jest.requireMock('../services/pago.service');
    await request(app)
      .post(`/api/comensal/mesa/${CUENTA}/pagos`)
      .set('Cookie', cookieDeComensal())
      .send({})
      .expect(201, { pagoId: 'p1', urlPago: 'https://mp/pagar' });
    expect(pagoService.pagar).toHaveBeenCalledWith(IDS.comensal, CUENTA, {});
  });

  it('el estado y el continuar de un pago van siempre como el comensal de la sesión', async () => {
    const { pagoService } = jest.requireMock('../services/pago.service');
    const PAGO = '01900000-0000-7000-8000-0000000000aa';
    await request(app)
      .get(`/api/comensal/pagos/${PAGO}`)
      .set('Cookie', cookieDeComensal())
      .expect(200);
    expect(pagoService.estado).toHaveBeenCalledWith(IDS.comensal, PAGO);
    await request(app)
      .post(`/api/comensal/pagos/${PAGO}/continuar`)
      .set('Cookie', cookieDeComensal())
      .expect(200, { pagoId: 'p1', urlPago: 'https://mp/pagar' });
    expect(pagoService.continuar).toHaveBeenCalledWith(IDS.comensal, PAGO);
  });
});

describe('/api/comensal/mesa/:id/beneficios', () => {
  const app = createApp();
  const { beneficiosComensalService } = jest.requireMock('../services/beneficios-comensal.service');

  it('consulta siempre como el comensal de la sesión', async () => {
    beneficiosComensalService.deMesa.mockResolvedValue({
      disponibles: [],
      noAlcanzados: [],
      beneficioUsado: false,
    });
    await request(app)
      .get(`/api/comensal/mesa/${CUENTA}/beneficios`)
      .set('Cookie', cookieDeComensal())
      .expect(200);
    expect(beneficiosComensalService.deMesa).toHaveBeenCalledWith(IDS.comensal, CUENTA);
  });

  it('el personal no consulta beneficios de una mesa', async () => {
    await request(app)
      .get(`/api/comensal/mesa/${CUENTA}/beneficios`)
      .set('Cookie', cookieConPermisos(['beneficio.ver']))
      .expect(403);
  });

  it('"Mis puntos" responde las cuentas del comensal', async () => {
    await request(app)
      .get('/api/comensal/fidelidad')
      .set('Cookie', cookieDeComensal())
      .expect(200, []);
    expect(beneficiosComensalService.fidelidad).toHaveBeenCalledWith(IDS.comensal);
  });
});
