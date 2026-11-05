import request from 'supertest';
import { createApp } from '../app';
import { cookieDeComensal } from '../test/sesion-falsa';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

jest.mock('../services/publico.service', () => ({
  publicoService: {
    buscar: jest.fn(),
    barrios: jest.fn(),
    obtenerMenu: jest.fn(),
    obtenerPlato: jest.fn(),
  },
}));

const ID = '01900000-0000-7000-8000-000000000011';

const RESULTADO = {
  restaurante: { id: ID, nombre: 'Demo' },
  sucursal: { id: ID, nombre: 'Centro', direccion: 'Calle 1', barrio: 'SAN_NICOLAS' },
  platosCoincidentes: ['Milanesa'],
};

describe('/api/publico', () => {
  const app = createApp();
  const { publicoService } = jest.requireMock('../services/publico.service');

  beforeEach(() => {
    publicoService.buscar.mockResolvedValue([RESULTADO]);
    publicoService.barrios.mockResolvedValue([{ valor: 'PALERMO', nombre: 'Palermo' }]);
    publicoService.obtenerMenu.mockResolvedValue({ sucursal: {}, menu: null });
    publicoService.obtenerPlato.mockResolvedValue({ sucursal: {}, plato: {} });
  });

  it('todas responden sin cookie', async () => {
    for (const ruta of [
      '/buscar',
      '/barrios',
      `/sucursales/${ID}/menu`,
      `/sucursales/${ID}/platos/${ID}`,
    ]) {
      expect((await request(app).get(`/api/publico${ruta}`)).status).toBe(200);
    }
  });

  it('buscar pasa el texto y el barrio al servicio', async () => {
    await request(app).get('/api/publico/buscar?q=milanesa&barrio=PALERMO');

    expect(publicoService.buscar).toHaveBeenCalledWith('milanesa', 'PALERMO');
  });

  it('un barrio inválido responde 400', async () => {
    expect((await request(app).get('/api/publico/buscar?barrio=GOTHAM')).status).toBe(400);
  });

  it('un texto de más de 100 caracteres responde 400, y de 100 pasa', async () => {
    expect((await request(app).get(`/api/publico/buscar?q=${'a'.repeat(101)}`)).status).toBe(400);
    expect((await request(app).get(`/api/publico/buscar?q=${'a'.repeat(100)}`)).status).toBe(200);
  });

  it('la respuesta de buscar tiene exactamente los campos públicos', async () => {
    const res = await request(app).get('/api/publico/buscar');

    expect(Object.keys(res.body[0]).sort()).toEqual([
      'platosCoincidentes',
      'restaurante',
      'sucursal',
    ]);
    expect(Object.keys(res.body[0].sucursal).sort()).toEqual([
      'barrio',
      'direccion',
      'id',
      'nombre',
    ]);
  });

  it('valida los ids de la carta y del plato', async () => {
    expect((await request(app).get('/api/publico/sucursales/no-es-uuid/menu')).status).toBe(400);
    expect((await request(app).get(`/api/publico/sucursales/${ID}/platos/no-es-uuid`)).status).toBe(
      400,
    );
  });

  it('la lista de sucursales de /comensal ya no existe', async () => {
    const res = await request(app)
      .get('/api/comensal/sucursales')
      .set('Cookie', cookieDeComensal());

    expect(res.status).toBe(404);
  });
});
