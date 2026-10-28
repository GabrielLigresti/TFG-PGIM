import request from 'supertest';
import { createApp } from '../app';
import { IDS } from '../test/fake-usuarios';
import { cookieConPermisos } from '../test/sesion-falsa';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

jest.mock('../repositories/fidelizacion.repository', () => ({
  fidelizacionRepository: {
    beneficios: jest.fn().mockResolvedValue([]),
    beneficio: jest.fn().mockResolvedValue(null),
    crearBeneficio: jest.fn(),
    existeMenu: jest.fn(),
    existeGrupo: jest.fn(),
  },
}));

const { fidelizacionRepository } = jest.requireMock('../repositories/fidelizacion.repository');

const BENEFICIO = {
  nombre: 'Postre de regalo',
  clase: 'RECOMPENSA',
  criterioTipo: 'VISITAS',
  criterioValor: 3,
  tipoDescuento: 'PORCENTAJE',
  valor: 10,
  vigenciaDesde: '2026-12-01T00:00:00Z',
  vigenciaHasta: '2026-12-31T00:00:00Z',
};

describe('/api/fidelizacion', () => {
  const app = createApp();

  it('sin sesión responde 401', async () => {
    await request(app).get('/api/fidelizacion/beneficios').expect(401);
  });

  it('con beneficio.ver lista solo los del restaurante de la sesión', async () => {
    await request(app)
      .get('/api/fidelizacion/beneficios?clase=PROMOCION')
      .set('Cookie', cookieConPermisos(['beneficio.ver']))
      .expect(200, []);
    expect(fidelizacionRepository.beneficios).toHaveBeenCalledWith(IDS.restaurante, {
      clase: 'PROMOCION',
    });
  });

  it('solo con beneficio.ver no puede crear', async () => {
    await request(app)
      .post('/api/fidelizacion/beneficios')
      .set('Cookie', cookieConPermisos(['beneficio.ver']))
      .send(BENEFICIO)
      .expect(403);
  });

  it('un porcentaje de 120 responde 400', async () => {
    await request(app)
      .post('/api/fidelizacion/beneficios')
      .set('Cookie', cookieConPermisos(['beneficio.crear']))
      .send({ ...BENEFICIO, valor: 120 })
      .expect(400);
    expect(fidelizacionRepository.crearBeneficio).not.toHaveBeenCalled();
  });

  it('relanzar un beneficio de otro restaurante responde 404', async () => {
    await request(app)
      .post('/api/fidelizacion/beneficios/01900000-0000-7000-8000-000000000099/relanzar')
      .set('Cookie', cookieConPermisos(['beneficio.editar']))
      .expect(404);
  });
});
