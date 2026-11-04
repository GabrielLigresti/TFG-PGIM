import request from 'supertest';
import { createApp } from '../app';
import { alertaRepository } from '../repositories/alerta.repository';
import { cookieConPermisos } from '../test/sesion-falsa';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

jest.mock('../repositories/alerta.repository', () => ({
  alertaRepository: {
    crearSiNoHay: jest.fn(),
    listarSinResolver: jest.fn().mockResolvedValue([]),
    resolver: jest.fn().mockResolvedValue(false),
  },
}));

const ALERTA = '01900000-0000-7000-8000-000000000091';

describe('/api/alertas', () => {
  const app = createApp();

  it('sin stock.registrar ni reserva.ver responde 403', async () => {
    await request(app)
      .get('/api/alertas')
      .set('Cookie', cookieConPermisos(['pedido.ver']))
      .expect(403);
  });

  it('con stock.registrar lista las alertas', async () => {
    await request(app)
      .get('/api/alertas')
      .set('Cookie', cookieConPermisos(['stock.registrar']))
      .expect(200, []);
  });

  it('con reserva.ver lista solo las inasistencias', async () => {
    await request(app)
      .get('/api/alertas')
      .set('Cookie', cookieConPermisos(['reserva.ver']))
      .expect(200, []);
    expect(alertaRepository.listarSinResolver).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      ['INASISTENCIA'],
    );
  });

  it('con ambos permisos lista los tres tipos', async () => {
    await request(app)
      .get('/api/alertas')
      .set('Cookie', cookieConPermisos(['stock.registrar', 'reserva.ver']))
      .expect(200);
    expect(alertaRepository.listarSinResolver).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      ['STOCK_INSUFICIENTE', 'PLATO_SIN_RECETA', 'INASISTENCIA'],
    );
  });

  it('resolver una alerta de otra sucursal responde 404', async () => {
    await request(app)
      .post(`/api/alertas/${ALERTA}/resolver`)
      .set('Cookie', cookieConPermisos(['stock.registrar']))
      .expect(404);
  });
});
