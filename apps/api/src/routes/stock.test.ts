import request from 'supertest';
import { createApp } from '../app';
import { cookieConPermisos } from '../test/sesion-falsa';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));
jest.mock('../services/stock.service', () => ({
  stockService: { listar: jest.fn(), registrar: jest.fn(), movimientos: jest.fn() },
}));
jest.mock('../services/produccion.service', () => ({
  produccionService: {
    plan: jest.fn(),
    registrar: jest.fn(),
    listar: jest.fn(),
    detalle: jest.fn(),
  },
}));

const ID = '01900000-0000-7000-8000-000000000011';
const movimientoValido = {
  tipo: 'INGRESO',
  componenteId: ID,
  cantidad: 1,
  unidad: 'KILOGRAMO',
  costoUnitario: 10,
};
const tandaValida = {
  intermedioId: ID,
  cantidadPlaneada: 1,
  unidad: 'KILOGRAMO',
  cantidadObtenida: 1,
  consumos: [{ componenteId: ID, cantidad: 1, unidad: 'KILOGRAMO' }],
};

describe('rutas de stock', () => {
  const app = createApp();
  const { stockService } = jest.requireMock('../services/stock.service');
  const { produccionService } = jest.requireMock('../services/produccion.service');

  beforeEach(() => {
    stockService.listar.mockResolvedValue([]);
    stockService.registrar.mockResolvedValue({ existencia: 1 });
    stockService.movimientos.mockResolvedValue({ filas: [], total: 0, pagina: 1 });
    produccionService.plan.mockResolvedValue({});
    produccionService.registrar.mockResolvedValue({ id: ID });
    produccionService.listar.mockResolvedValue({ filas: [], total: 0, pagina: 1 });
    produccionService.detalle.mockResolvedValue({ id: ID });
  });

  it('con stock.registrar: lee y registra', async () => {
    const cookie = cookieConPermisos(['stock.registrar']);
    expect((await request(app).get('/api/stock').set('Cookie', cookie)).status).toBe(200);
    const mov = await request(app)
      .post('/api/stock/movimientos')
      .set('Cookie', cookie)
      .send(movimientoValido);
    expect(mov.status).toBe(201);
    expect(stockService.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        restauranteId: expect.any(String),
        sucursalId: expect.any(String),
        empleadoId: expect.any(String),
      }),
      expect.objectContaining({ tipo: 'INGRESO' }),
    );
    const tanda = await request(app)
      .post('/api/stock/produccion')
      .set('Cookie', cookie)
      .send(tandaValida);
    expect(tanda.status).toBe(201);
  });

  it('con insumo.ver: lee pero no registra', async () => {
    const cookie = cookieConPermisos(['insumo.ver']);
    for (const url of [
      '/api/stock',
      '/api/stock/movimientos',
      '/api/stock/produccion',
      `/api/stock/produccion/${ID}`,
    ]) {
      expect((await request(app).get(url).set('Cookie', cookie)).status).toBe(200);
    }
    const mov = await request(app)
      .post('/api/stock/movimientos')
      .set('Cookie', cookie)
      .send(movimientoValido);
    expect(mov.status).toBe(403);
    const tanda = await request(app)
      .post('/api/stock/produccion')
      .set('Cookie', cookie)
      .send(tandaValida);
    expect(tanda.status).toBe(403);
    const plan = await request(app)
      .get(`/api/stock/produccion/plan?intermedioId=${ID}&cantidad=1&unidad=KILOGRAMO`)
      .set('Cookie', cookie);
    expect(plan.status).toBe(403);
  });

  it('sin permisos responde 403', async () => {
    const res = await request(app).get('/api/stock').set('Cookie', cookieConPermisos([]));
    expect(res.status).toBe(403);
  });

  it('una merma sin motivo responde 400', async () => {
    const res = await request(app)
      .post('/api/stock/movimientos')
      .set('Cookie', cookieConPermisos(['stock.registrar']))
      .send({ tipo: 'MERMA', componenteId: ID, cantidad: 1, unidad: 'KILOGRAMO' });
    expect(res.status).toBe(400);
  });

  it('un id mal formado responde 400', async () => {
    const res = await request(app)
      .get('/api/stock/produccion/no-es-uuid')
      .set('Cookie', cookieConPermisos(['insumo.ver']));
    expect(res.status).toBe(400);
  });
});
