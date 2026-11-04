import request from 'supertest';
import { createApp } from '../app';
import { cookieConPermisos } from '../test/sesion-falsa';
import { IDS } from '../test/fake-usuarios';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

jest.mock('../repositories/planificacion.repository', () => ({
  planificacionRepository: { turnosDe: jest.fn() },
}));

const repo = jest.requireMock('../repositories/planificacion.repository').planificacionRepository;

describe('GET /api/turnos/mios', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    repo.turnosDe.mockResolvedValue([]);
  });

  it('sin sesión responde 401', async () => {
    await request(app).get('/api/turnos/mios').expect(401);
  });

  it('sin turno.ver responde 403', async () => {
    await request(app)
      .get('/api/turnos/mios')
      .set('Cookie', cookieConPermisos(['pedido.ver']))
      .expect(403);
    expect(repo.turnosDe).not.toHaveBeenCalled();
  });

  it('usa el usuario de la sesión y el día de hoy', async () => {
    const turnos = [
      {
        fecha: '2026-11-10',
        franja: 'CENA',
        sucursal: 'Centro',
        horaInicio: '20:00',
        horaFin: '00:00',
      },
    ];
    repo.turnosDe.mockResolvedValue(turnos);
    const res = await request(app)
      .get('/api/turnos/mios')
      .set('Cookie', cookieConPermisos(['turno.ver']))
      .expect(200);
    expect(res.body).toEqual(turnos);
    expect(repo.turnosDe).toHaveBeenCalledWith(
      IDS.restaurante,
      IDS.admin,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });
});
