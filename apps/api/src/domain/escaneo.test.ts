import type { EstadoEscaneo } from '@pgim/shared';
import { AppError } from '../lib/errors';
import { ESTADOS_ESCANEO_ACTIVOS, estadoDeEscaneo } from './escaneo';

type Accion = 'enviar' | 'completar' | 'fallar' | 'publicar' | 'descartar';

const ACCIONES: Accion[] = ['enviar', 'completar', 'fallar', 'publicar', 'descartar'];

// Transiciones válidas (diagrama estado/escaneo-plato/v1).
const VALIDAS: Record<EstadoEscaneo, Partial<Record<Accion, EstadoEscaneo>>> = {
  PENDIENTE: { enviar: 'PROCESANDO', fallar: 'FALLIDO' },
  PROCESANDO: { completar: 'EN_REVISION', fallar: 'FALLIDO' },
  EN_REVISION: { publicar: 'PUBLICADO', descartar: 'DESCARTADO' },
  PUBLICADO: {},
  DESCARTADO: {},
  FALLIDO: {},
};

const PALABRAS: Record<EstadoEscaneo, string> = {
  PENDIENTE: 'pendiente',
  PROCESANDO: 'en proceso',
  EN_REVISION: 'en revisión',
  PUBLICADO: 'publicado',
  DESCARTADO: 'descartado',
  FALLIDO: 'fallido',
};

const validas = Object.entries(VALIDAS).flatMap(([estado, acciones]) =>
  Object.entries(acciones).map(([accion, hacia]) => [estado, accion, hacia] as const),
);

const invalidas = (Object.keys(VALIDAS) as EstadoEscaneo[]).flatMap((estado) =>
  ACCIONES.filter((a) => !(a in VALIDAS[estado])).map((a) => [estado, a] as const),
);

describe('State del escaneo', () => {
  it('cada estado conoce su nombre', () => {
    for (const estado of Object.keys(VALIDAS) as EstadoEscaneo[]) {
      expect(estadoDeEscaneo(estado).nombre).toBe(estado);
    }
  });

  it.each(validas)('%s: %s lleva a %s', (estado, accion, hacia) => {
    expect(estadoDeEscaneo(estado as EstadoEscaneo)[accion as Accion]()).toBe(hacia);
  });

  it.each(invalidas)('%s: %s lanza 409 con el estado en palabras', (estado, accion) => {
    const e = estado as EstadoEscaneo;
    let error: unknown;
    try {
      estadoDeEscaneo(e)[accion as Accion]();
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(409);
    expect((error as AppError).message).toBe(`El escaneo ya está ${PALABRAS[e]}`);
  });

  it('los estados activos son pendiente, en proceso y en revisión', () => {
    expect(ESTADOS_ESCANEO_ACTIVOS).toEqual(['PENDIENTE', 'PROCESANDO', 'EN_REVISION']);
  });
});
