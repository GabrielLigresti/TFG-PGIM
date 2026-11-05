import {
  UMBRALES_POR_DEFECTO,
  type EstadoEscaneo,
  type InformeCalidad,
  type Plato,
} from '@pgim/shared';
import type { RegistroProveedores } from '../escaneo/registro';
import { AppError } from '../lib/errors';
import type { EscaneoRepository, FilaEscaneo } from '../repositories/escaneo.repository';
import { mp4Falso } from '../test/mp4-falso';
import { createEscaneoService } from './escaneo.service';

const R = 'restaurante';
const AHORA = new Date('2026-11-05T12:00:00Z');

const informe = (parcial: Partial<InformeCalidad> = {}): InformeCalidad => ({
  version: 1,
  nivelGlobal: 'OK',
  metadatos: { ancho: 1920, alto: 1080, duracionS: 30 },
  criterios: [],
  ...parcial,
});

const video = (o: Partial<Parameters<typeof mp4Falso>[0]> = {}) =>
  mp4Falso({ ancho: 1920, alto: 1080, duracionS: 30, ...o });

function fila(parcial: Partial<FilaEscaneo> = {}): FilaEscaneo {
  return {
    id: 'e1',
    restauranteId: R,
    itemMenuId: 'bife',
    empleadoId: 'emp',
    estado: 'EN_REVISION',
    proveedor: 'simulado',
    tareaProveedorId: 't',
    rutaVideo: null,
    urlModelo: '/api/uploads/modelos/nuevo.glb',
    urlModeloIos: null,
    calidad: informe(),
    error: null,
    creadoEn: AHORA,
    actualizadoEn: AHORA,
    ...parcial,
  };
}

function montar(opciones: { repo?: Partial<EscaneoRepository>; plato?: Plato | null } = {}) {
  const repo = {
    crear: jest.fn().mockImplementation(async (d) => fila({ ...d, estado: 'PENDIENTE' })),
    ultimoDelPlato: jest.fn().mockResolvedValue(null),
    buscar: jest.fn().mockResolvedValue(fila()),
    enCurso: jest.fn(),
    cambiarEstado: jest.fn().mockResolvedValue(true),
    publicar: jest.fn().mockResolvedValue({ anterior: null }),
    ...opciones.repo,
  } as jest.Mocked<EscaneoRepository>;
  const deps = {
    menu: {
      buscarPlato: jest.fn().mockResolvedValue(opciones.plato === undefined ? {} : opciones.plato),
    },
    videos: {
      guardarVideo: jest.fn().mockResolvedValue('/uploads/escaneos/v.mp4'),
      leerVideo: jest.fn(),
      borrarVideo: jest.fn().mockResolvedValue(undefined),
    },
    modelos: {
      validarGlb: jest.fn(),
      validarUsdz: jest.fn(),
      guardarModelo: jest.fn(),
      borrarModelo: jest.fn().mockResolvedValue(undefined),
    },
    proveedores: {
      activo: () => ({ nombre: 'simulado', requisitos: () => UMBRALES_POR_DEFECTO }),
      buscar: jest.fn(),
    } as unknown as RegistroProveedores,
    ahora: () => AHORA,
    timeoutMin: 30,
  };
  return { repo, deps, service: createEscaneoService(repo, deps as never) };
}

async function falla(promesa: Promise<unknown>, status: number, mensaje: string) {
  const error = await promesa.catch((e) => e);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ status, message: mensaje });
}

describe('crear', () => {
  it('guarda el video y crea el escaneo PENDIENTE con el proveedor activo', async () => {
    const { service, repo, deps } = montar();
    const escaneo = await service.crear(R, 'bife', 'emp', video(), informe());
    expect(deps.videos.guardarVideo).toHaveBeenCalledWith(expect.any(Buffer), 'mp4');
    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        restauranteId: R,
        itemMenuId: 'bife',
        empleadoId: 'emp',
        proveedor: 'simulado',
        rutaVideo: '/uploads/escaneos/v.mp4',
      }),
    );
    expect(escaneo).toMatchObject({
      platoId: 'bife',
      estado: 'PENDIENTE',
      creadoEn: AHORA.toISOString(),
    });
  });

  it('404 si el plato no es del restaurante', async () => {
    const { service, deps } = montar({ plato: null });
    await falla(service.crear(R, 'x', 'emp', video(), informe()), 404, 'El plato no existe');
    expect(deps.videos.guardarVideo).not.toHaveBeenCalled();
  });

  it('400 si el archivo no es un MP4', async () => {
    const { service } = montar();
    await expect(
      service.crear(R, 'bife', 'emp', Buffer.from('nada'), informe()),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('422 si el informe ya trae RECHAZO', async () => {
    const { service } = montar();
    await falla(
      service.crear(R, 'bife', 'emp', video(), informe({ nivelGlobal: 'RECHAZO' })),
      422,
      'El video no pasó la revisión de calidad',
    );
  });

  it('422 si el formato real no cumple los requisitos del proveedor', async () => {
    const { service } = montar();
    const corto = video({ duracionS: 5 });
    await falla(
      service.crear(
        R,
        'bife',
        'emp',
        corto,
        informe({ metadatos: { ancho: 1920, alto: 1080, duracionS: 5 } }),
      ),
      422,
      'El video tiene que durar entre 10 segundos y 3 minutos',
    );
  });

  it.each([
    ['la duración', { ancho: 1920, alto: 1080, duracionS: 32 }],
    ['el lado menor', { ancho: 1920, alto: 1070, duracionS: 30 }],
    ['el lado mayor', { ancho: 1900, alto: 1080, duracionS: 30 }],
  ])('422 si difiere %s del informe', async (_caso, metadatos) => {
    const { service, deps } = montar();
    await falla(
      service.crear(R, 'bife', 'emp', video(), informe({ metadatos })),
      422,
      'El informe de calidad no corresponde a este video',
    );
    expect(deps.videos.guardarVideo).not.toHaveBeenCalled();
  });

  it('acepta un video vertical: tkhd 1920x1080 e informe 1080x1920', async () => {
    const { service } = montar();
    const escaneo = await service.crear(
      R,
      'bife',
      'emp',
      video(),
      informe({ metadatos: { ancho: 1080, alto: 1920, duracionS: 30 } }),
    );
    expect(escaneo.estado).toBe('PENDIENTE');
  });

  it('tolera hasta 1 s y 2 px de diferencia', async () => {
    const { service } = montar();
    await expect(
      service.crear(
        R,
        'bife',
        'emp',
        video(),
        informe({ metadatos: { ancho: 1922, alto: 1078, duracionS: 31 } }),
      ),
    ).resolves.toBeDefined();
  });

  it('409 si el plato ya tiene un escaneo activo', async () => {
    for (const estado of ['PENDIENTE', 'PROCESANDO', 'EN_REVISION'] as EstadoEscaneo[]) {
      const { service, deps } = montar({
        repo: { ultimoDelPlato: jest.fn().mockResolvedValue(fila({ estado })) },
      });
      await falla(
        service.crear(R, 'bife', 'emp', video(), informe()),
        409,
        'Este plato ya tiene un escaneo en curso',
      );
      expect(deps.videos.guardarVideo).not.toHaveBeenCalled();
    }
  });

  it('409 y borra el video si el índice único rechaza el alta (P2002)', async () => {
    const { service, deps } = montar({
      repo: { crear: jest.fn().mockRejectedValue({ code: 'P2002' }) },
    });
    await falla(
      service.crear(R, 'bife', 'emp', video(), informe()),
      409,
      'Este plato ya tiene un escaneo en curso',
    );
    expect(deps.videos.borrarVideo).toHaveBeenCalledWith('/uploads/escaneos/v.mp4');
  });

  it('borra el video y propaga cualquier otro error del repositorio', async () => {
    const { service, deps } = montar({
      repo: { crear: jest.fn().mockRejectedValue(new Error('caída')) },
    });
    await expect(service.crear(R, 'bife', 'emp', video(), informe())).rejects.toThrow('caída');
    expect(deps.videos.borrarVideo).toHaveBeenCalledWith('/uploads/escaneos/v.mp4');
  });

  it.each(['FALLIDO', 'DESCARTADO', 'PUBLICADO'] as EstadoEscaneo[])(
    'permite reescanear si el último está %s',
    async (estado) => {
      const { service } = montar({
        repo: { ultimoDelPlato: jest.fn().mockResolvedValue(fila({ estado })) },
      });
      await expect(service.crear(R, 'bife', 'emp', video(), informe())).resolves.toMatchObject({
        estado: 'PENDIENTE',
      });
    },
  );
});

describe('ultimo y requisitos', () => {
  it('ultimo devuelve null o el escaneo armado', async () => {
    const { service, repo } = montar();
    expect(await service.ultimo(R, 'bife')).toBeNull();
    repo.ultimoDelPlato.mockResolvedValue(fila());
    expect(await service.ultimo(R, 'bife')).toMatchObject({ id: 'e1', platoId: 'bife' });
  });

  it('requisitos son los del proveedor activo', () => {
    expect(montar().service.requisitos()).toEqual(UMBRALES_POR_DEFECTO);
  });
});

describe('publicar', () => {
  const datos = { escalaReal: 1, porcionGramos: 300 };
  const anterior = {
    urlModelo: '/api/uploads/modelos/viejo.glb',
    urlModeloIos: '/api/uploads/modelos/viejo.usdz',
    escalaReal: 1,
    porcionGramos: 200,
  };

  it('borra el .glb y el .usdz anteriores después de publicar', async () => {
    const { service, repo, deps } = montar({
      repo: { publicar: jest.fn().mockResolvedValue({ anterior }) },
    });
    repo.buscar.mockResolvedValueOnce(fila()).mockResolvedValueOnce(fila({ estado: 'PUBLICADO' }));
    const escaneo = await service.publicar(R, 'e1', datos);
    expect(escaneo.estado).toBe('PUBLICADO');
    expect(deps.modelos.borrarModelo).toHaveBeenCalledWith(anterior.urlModelo);
    expect(deps.modelos.borrarModelo).toHaveBeenCalledWith(anterior.urlModeloIos);
  });

  it('un escaneo sin .usdz deja urlModeloIos null: el repositorio recibe el escaneo tal cual y se borra el .usdz viejo', async () => {
    const { service, repo, deps } = montar({
      repo: { publicar: jest.fn().mockResolvedValue({ anterior }) },
    });
    await service.publicar(R, 'e1', datos);
    expect(repo.publicar).toHaveBeenCalledWith(R, 'e1', datos);
    expect(deps.modelos.borrarModelo).toHaveBeenCalledWith(anterior.urlModeloIos);
  });

  it('sin modelo anterior no borra nada', async () => {
    const { service, deps } = montar();
    await service.publicar(R, 'e1', datos);
    expect(deps.modelos.borrarModelo).not.toHaveBeenCalled();
  });

  it('no borra nada si el repositorio falla', async () => {
    const { service, deps } = montar({
      repo: { publicar: jest.fn().mockRejectedValue(new Error('caída')) },
    });
    await expect(service.publicar(R, 'e1', datos)).rejects.toThrow('caída');
    expect(deps.modelos.borrarModelo).not.toHaveBeenCalled();
  });

  it('si borrar un archivo falla, publica igual y sigue con el otro', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, deps } = montar({
      repo: { publicar: jest.fn().mockResolvedValue({ anterior }) },
    });
    deps.modelos.borrarModelo.mockRejectedValueOnce(new Error('disco'));
    await expect(service.publicar(R, 'e1', datos)).resolves.toBeDefined();
    expect(deps.modelos.borrarModelo).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('409 si la transacción dice que ya no estaba en revisión', async () => {
    const { service, deps } = montar({ repo: { publicar: jest.fn().mockResolvedValue(null) } });
    await falla(service.publicar(R, 'e1', datos), 409, 'El escaneo ya está publicado o descartado');
    expect(deps.modelos.borrarModelo).not.toHaveBeenCalled();
  });

  it('409 si está PROCESANDO, sin tocar el repositorio', async () => {
    const { service, repo } = montar({
      repo: { buscar: jest.fn().mockResolvedValue(fila({ estado: 'PROCESANDO' })) },
    });
    await expect(service.publicar(R, 'e1', datos)).rejects.toMatchObject({ status: 409 });
    expect(repo.publicar).not.toHaveBeenCalled();
  });

  it('404 si el escaneo no existe', async () => {
    const { service } = montar({ repo: { buscar: jest.fn().mockResolvedValue(null) } });
    await falla(service.publicar(R, 'e1', datos), 404, 'El escaneo no existe');
  });
});

describe('descartar', () => {
  it('pasa a DESCARTADO y borra el borrador', async () => {
    const fPrev = fila({ urlModeloIos: '/api/uploads/modelos/nuevo.usdz' });
    const { service, repo, deps } = montar();
    repo.buscar
      .mockResolvedValueOnce(fPrev)
      .mockResolvedValueOnce({ ...fPrev, estado: 'DESCARTADO' });
    const escaneo = await service.descartar(R, 'e1');
    expect(repo.cambiarEstado).toHaveBeenCalledWith(R, 'e1', 'EN_REVISION', {
      estado: 'DESCARTADO',
    });
    expect(escaneo.estado).toBe('DESCARTADO');
    expect(deps.modelos.borrarModelo).toHaveBeenCalledWith(fPrev.urlModelo);
    expect(deps.modelos.borrarModelo).toHaveBeenCalledWith(fPrev.urlModeloIos);
  });

  it('409 si cambió de estado en el medio y no borra nada', async () => {
    const { service, deps } = montar({
      repo: { cambiarEstado: jest.fn().mockResolvedValue(false) },
    });
    await falla(service.descartar(R, 'e1'), 409, 'El escaneo ya está publicado o descartado');
    expect(deps.modelos.borrarModelo).not.toHaveBeenCalled();
  });

  it('409 si está PROCESANDO', async () => {
    const { service, repo } = montar({
      repo: { buscar: jest.fn().mockResolvedValue(fila({ estado: 'PROCESANDO' })) },
    });
    await expect(service.descartar(R, 'e1')).rejects.toMatchObject({ status: 409 });
    expect(repo.cambiarEstado).not.toHaveBeenCalled();
  });
});

it('procesarEnCurso queda pendiente hasta la tarea 8', async () => {
  await expect(montar().service.procesarEnCurso()).rejects.toThrow('pendiente');
});
