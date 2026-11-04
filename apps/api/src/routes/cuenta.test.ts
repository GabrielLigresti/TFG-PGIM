import request from 'supertest';
import { createApp } from '../app';
import { IDS } from '../test/fake-usuarios';
import { cookieConPermisos, cookieDeComensal } from '../test/sesion-falsa';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

jest.mock('../services/cuenta.service', () => ({
  cuentaService: {
    obtener: jest.fn().mockResolvedValue({ tipo: 'COMENSAL' }),
    actualizarComensal: jest.fn().mockResolvedValue({ tipo: 'COMENSAL' }),
    actualizarEmpleado: jest.fn().mockResolvedValue({ tipo: 'EMPLEADO' }),
    subirFoto: jest.fn().mockResolvedValue({ fotoUrl: '/api/uploads/fotos/x.png' }),
    cambiarContrasena: jest.fn().mockResolvedValue(undefined),
  },
}));

const { cuentaService } = jest.requireMock('../services/cuenta.service');

beforeEach(() => jest.clearAllMocks());

describe('/api/cuenta', () => {
  const app = createApp();

  it('sin cookie responde 401 en las cuatro rutas', async () => {
    await request(app).get('/api/cuenta').expect(401);
    await request(app).put('/api/cuenta').send({}).expect(401);
    await request(app).put('/api/cuenta/foto').expect(401);
    await request(app).put('/api/cuenta/contrasena').send({}).expect(401);
  });

  it('el comensal lee su cuenta con su propio usuarioId y sin restaurante', async () => {
    await request(app).get('/api/cuenta').set('Cookie', cookieDeComensal()).expect(200);
    expect(cuentaService.obtener).toHaveBeenCalledWith(IDS.comensal, null);
  });

  it('el empleado lee su cuenta con el restaurante de la sesión', async () => {
    await request(app).get('/api/cuenta').set('Cookie', cookieConPermisos([])).expect(200);
    expect(cuentaService.obtener).toHaveBeenCalledWith(IDS.admin, IDS.restaurante);
  });

  it('comensal: PUT con nombreCompleto y sin nombre responde 400', async () => {
    await request(app)
      .put('/api/cuenta')
      .set('Cookie', cookieDeComensal())
      .send({ nombreCompleto: 'Cora', telefono: null })
      .expect(400);
    expect(cuentaService.actualizarComensal).not.toHaveBeenCalled();
  });

  it('comensal: un nombre en blanco responde 400', async () => {
    await request(app)
      .put('/api/cuenta')
      .set('Cookie', cookieDeComensal())
      .send({ nombre: '  ', telefono: null })
      .expect(400);
  });

  it('comensal: un teléfono vacío llega al servicio como null', async () => {
    await request(app)
      .put('/api/cuenta')
      .set('Cookie', cookieDeComensal())
      .send({ nombre: ' Cora ', telefono: '  ' })
      .expect(200);
    expect(cuentaService.actualizarComensal).toHaveBeenCalledWith(IDS.comensal, {
      nombre: 'Cora',
      telefono: null,
    });
  });

  it('empleado: PUT válido responde 200 y el servicio recibe el usuarioId del token, no el del body', async () => {
    await request(app)
      .put('/api/cuenta')
      .set('Cookie', cookieConPermisos([]))
      .send({ nombreCompleto: 'Eli', usuarioId: IDS.ajena })
      .expect(200);
    expect(cuentaService.actualizarEmpleado).toHaveBeenCalledWith(IDS.admin, IDS.restaurante, {
      nombreCompleto: 'Eli',
    });
  });

  it('empleado: PUT con campos del comensal (sin nombreCompleto) responde 400', async () => {
    await request(app)
      .put('/api/cuenta')
      .set('Cookie', cookieConPermisos([]))
      .send({ nombre: 'Eli', telefono: null })
      .expect(400);
  });

  it('comensal: PUT /foto responde 403', async () => {
    await request(app)
      .put('/api/cuenta/foto')
      .set('Cookie', cookieDeComensal())
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('x'))
      .expect(403);
  });

  it('empleado: foto vacía responde 400', async () => {
    await request(app)
      .put('/api/cuenta/foto')
      .set('Cookie', cookieConPermisos([]))
      .set('Content-Type', 'application/octet-stream')
      .expect(400);
    expect(cuentaService.subirFoto).not.toHaveBeenCalled();
  });

  it('empleado: foto válida va al servicio con el usuarioId y el restaurante de la sesión', async () => {
    await request(app)
      .put('/api/cuenta/foto')
      .set('Cookie', cookieConPermisos([]))
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('imagen'))
      .expect(200);
    expect(cuentaService.subirFoto).toHaveBeenCalledWith(
      IDS.admin,
      IDS.restaurante,
      expect.any(Buffer),
    );
  });

  it('contraseña: nueva igual a la actual responde 400', async () => {
    await request(app)
      .put('/api/cuenta/contrasena')
      .set('Cookie', cookieDeComensal())
      .send({ actual: 'clave1234', nueva: 'clave1234' })
      .expect(400);
    expect(cuentaService.cambiarContrasena).not.toHaveBeenCalled();
  });

  it('contraseña: una nueva corta responde 400', async () => {
    await request(app)
      .put('/api/cuenta/contrasena')
      .set('Cookie', cookieDeComensal())
      .send({ actual: 'clave1234', nueva: 'corta' })
      .expect(400);
  });

  it('contraseña válida responde 204 y usa el usuarioId del token', async () => {
    await request(app)
      .put('/api/cuenta/contrasena')
      .set('Cookie', cookieDeComensal())
      .send({ actual: 'clave1234', nueva: 'otra-clave99', usuarioId: IDS.ajena })
      .expect(204);
    expect(cuentaService.cambiarContrasena).toHaveBeenCalledWith(
      IDS.comensal,
      'clave1234',
      'otra-clave99',
    );
  });
});
