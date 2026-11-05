import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { InformeCalidad } from '@pgim/shared';

jest.mock('../repositories/usuario.repository', () => ({
  usuarioRepository: { findCredencialesByEmail: jest.fn(), findSesionById: jest.fn() },
}));

// Las rutas se prueban sin base: el servicio se reemplaza y los casos de negocio
// (plato ajeno, escaneo activo, rechazo) se simulan con el error que lanza.
jest.mock('../services/escaneo.service', () => ({
  escaneoService: {
    requisitos: jest.fn(),
    crear: jest.fn(),
    ultimo: jest.fn(),
    publicar: jest.fn(),
    descartar: jest.fn(),
  },
}));

// La carpeta de uploads se fija antes de cargar la configuración: por eso la
// app y la sesión falsa se cargan con require, después de esta línea.
const UPLOADS = mkdtempSync(path.join(tmpdir(), 'pgim-uploads-'));
process.env.UPLOADS_DIR = UPLOADS;
const { createApp } = require('../app') as typeof import('../app');
const { cookieConPermisos } =
  require('../test/sesion-falsa') as typeof import('../test/sesion-falsa');
const { AppError } = require('../lib/errors') as typeof import('../lib/errors');
const { mp4Falso } = require('../test/mp4-falso') as typeof import('../test/mp4-falso');
const { escaneoService } = jest.requireMock('../services/escaneo.service') as {
  escaneoService: Record<'requisitos' | 'crear' | 'ultimo' | 'publicar' | 'descartar', jest.Mock>;
};

const ID = '01900000-0000-7000-8000-000000000011';
const ESCANEO = { id: ID, platoId: ID, estado: 'PENDIENTE' };
const EDITAR = ['menu.editar'] as const;

const video = mp4Falso({ ancho: 1920, alto: 1080, duracionS: 20 });

function informe(mensaje: string | null = null, nivelGlobal: InformeCalidad['nivelGlobal'] = 'OK') {
  return {
    version: 1,
    nivelGlobal,
    metadatos: { ancho: 1920, alto: 1080, duracionS: 20 },
    criterios: [{ criterio: 'NITIDEZ', nivel: nivelGlobal, valor: 1, mensaje }],
  };
}

const aBase64Url = (texto: string) => Buffer.from(texto, 'utf8').toString('base64url');
const encabezado = (i: unknown) => aBase64Url(JSON.stringify(i));

describe('modelos RA servidos como estáticos', () => {
  const app = createApp();

  beforeAll(() => {
    const carpeta = path.join(UPLOADS, 'modelos');
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(path.join(carpeta, 'abc.glb'), 'glTF');
  });

  it('se descargan sin sesión, con tipo fijo y nosniff', async () => {
    const res = await request(app).get('/api/uploads/modelos/abc.glb');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('model/gltf-binary');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('no se lista la carpeta', async () => {
    expect((await request(app).get('/api/uploads/modelos/')).status).toBe(404);
  });

  it('no se sale de la carpeta', async () => {
    const res = await request(app).get('/api/uploads/modelos/..%2F..%2Fpackage.json');
    expect(res.status).not.toBe(200);
  });
});

describe('retiro de la subida manual', () => {
  const app = createApp();

  it('PUT /platos/:id/modelo-ra/glb ya no existe', async () => {
    const res = await request(app)
      .put(`/api/platos/${ID}/modelo-ra/glb`)
      .set('Cookie', cookieConPermisos([...EDITAR]))
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('glTF'));

    expect(res.status).toBe(404);
  });
});

describe('POST /api/platos/:id/escaneos', () => {
  const app = createApp();
  const enviar = (permisos: string[] = [...EDITAR]) =>
    request(app)
      .post(`/api/platos/${ID}/escaneos`)
      .set('Cookie', cookieConPermisos(permisos as never))
      .set('Content-Type', 'application/octet-stream');

  beforeEach(() => jest.resetAllMocks());

  it('sin menu.editar responde 403', async () => {
    const res = await enviar(['menu.ver'])
      .set('X-Calidad-Video', encabezado(informe()))
      .send(video);

    expect(res.status).toBe(403);
    expect(escaneoService.crear).not.toHaveBeenCalled();
  });

  it('crea el escaneo con el empleado de la sesión', async () => {
    escaneoService.crear.mockResolvedValue(ESCANEO);

    const res = await enviar().set('X-Calidad-Video', encabezado(informe())).send(video);

    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('PENDIENTE');
    const [restauranteId, platoId, empleadoId, cuerpo, enviado] =
      escaneoService.crear.mock.calls[0]!;
    expect(restauranteId).toEqual(expect.any(String));
    expect(platoId).toBe(ID);
    expect(empleadoId).toEqual(expect.any(String));
    expect(Buffer.isBuffer(cuerpo)).toBe(true);
    expect(enviado).toEqual(informe());
  });

  it('decodifica un informe con tildes y "ñ" en un mensaje', async () => {
    escaneoService.crear.mockResolvedValue(ESCANEO);
    const conTildes = informe('Más luz: el plato está oscuro y borroso, probá otra vez');

    const res = await enviar().set('X-Calidad-Video', encabezado(conTildes)).send(video);

    expect(res.status).toBe(201);
    expect(escaneoService.crear.mock.calls[0]![4]).toEqual(conTildes);
  });

  it.each([
    ['falta', undefined],
    ['no es base64', '%%%'],
    ['no es JSON', aBase64Url('esto no es json')],
    ['no es un informe', aBase64Url('{"version":2}')],
  ])('si el encabezado %s responde 422 y no 500', async (_caso, valor) => {
    const pedido = enviar();
    if (valor !== undefined) pedido.set('X-Calidad-Video', valor);

    const res = await pedido.send(video);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Falta el informe de calidad del video');
    expect(escaneoService.crear).not.toHaveBeenCalled();
  });

  it('con el cuerpo vacío responde 400', async () => {
    const res = await enviar().set('X-Calidad-Video', encabezado(informe())).send(Buffer.alloc(0));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Falta el video');
  });

  it('responde 404 si el plato es de otro restaurante', async () => {
    escaneoService.crear.mockRejectedValue(new AppError(404, 'El plato no existe'));

    const res = await enviar().set('X-Calidad-Video', encabezado(informe())).send(video);

    expect(res.status).toBe(404);
  });

  it('responde 409 si ya hay un escaneo en curso', async () => {
    escaneoService.crear.mockRejectedValue(
      new AppError(409, 'Este plato ya tiene un escaneo en curso'),
    );

    const res = await enviar().set('X-Calidad-Video', encabezado(informe())).send(video);

    expect(res.status).toBe(409);
  });

  it('responde 422 si el informe es un rechazo', async () => {
    escaneoService.crear.mockRejectedValue(
      new AppError(422, 'El video no pasó la revisión de calidad'),
    );

    const res = await enviar()
      .set('X-Calidad-Video', encabezado(informe('Muy oscuro', 'RECHAZO')))
      .send(video);

    expect(res.status).toBe(422);
  });
});

describe('GET /api/platos/:id/escaneo', () => {
  const app = createApp();
  beforeEach(() => jest.resetAllMocks());

  it('sin escaneos responde 200 con null', async () => {
    escaneoService.ultimo.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/platos/${ID}/escaneo`)
      .set('Cookie', cookieConPermisos(['menu.editar']));

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('sin menu.editar responde 403', async () => {
    const res = await request(app)
      .get(`/api/platos/${ID}/escaneo`)
      .set('Cookie', cookieConPermisos(['menu.ver']));

    expect(res.status).toBe(403);
  });
});

describe('/api/escaneos', () => {
  const app = createApp();
  beforeEach(() => jest.resetAllMocks());

  it('GET /requisitos devuelve los umbrales del proveedor', async () => {
    escaneoService.requisitos.mockReturnValue({ anchoMin: 1280 });

    const res = await request(app)
      .get('/api/escaneos/requisitos')
      .set('Cookie', cookieConPermisos(['menu.editar']));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ anchoMin: 1280 });
  });

  it('GET /requisitos sin menu.editar responde 403', async () => {
    const res = await request(app)
      .get('/api/escaneos/requisitos')
      .set('Cookie', cookieConPermisos(['menu.ver']));

    expect(res.status).toBe(403);
  });

  it('publicar con datos inválidos responde 400', async () => {
    const res = await request(app)
      .post(`/api/escaneos/${ID}/publicar`)
      .set('Cookie', cookieConPermisos(['menu.editar']))
      .send({ escalaReal: 'mucho' });

    expect(res.status).toBe(400);
    expect(escaneoService.publicar).not.toHaveBeenCalled();
  });

  it('publicar con datos válidos responde 200', async () => {
    escaneoService.publicar.mockResolvedValue({ ...ESCANEO, estado: 'PUBLICADO' });

    const res = await request(app)
      .post(`/api/escaneos/${ID}/publicar`)
      .set('Cookie', cookieConPermisos(['menu.editar']))
      .send({ escalaReal: 0.5, porcionGramos: 350 });

    expect(res.status).toBe(200);
    expect(escaneoService.publicar).toHaveBeenCalledWith(expect.any(String), ID, {
      escalaReal: 0.5,
      porcionGramos: 350,
    });
  });

  it('descartar responde 200', async () => {
    escaneoService.descartar.mockResolvedValue({ ...ESCANEO, estado: 'DESCARTADO' });

    const res = await request(app)
      .post(`/api/escaneos/${ID}/descartar`)
      .set('Cookie', cookieConPermisos(['menu.editar']));

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('DESCARTADO');
  });
});
