import type { Request, Response } from 'express';
import type { CodigoPermiso } from '@pgim/shared';
import { requiereAlgunPermiso } from './auth';

function correr(tiene: CodigoPermiso[], pide: CodigoPermiso[]) {
  const next = jest.fn();
  const req = { sesion: { permisos: tiene } } as unknown as Request;
  const ejecutar = () => requiereAlgunPermiso(...pide)(req, {} as Response, next);
  return { next, ejecutar };
}

describe('requiereAlgunPermiso', () => {
  it('pasa con uno de los permisos', () => {
    const { next, ejecutar } = correr(['stock.registrar'], ['insumo.ver', 'stock.registrar']);
    ejecutar();
    expect(next).toHaveBeenCalled();
  });

  it('responde 403 si no tiene ninguno', () => {
    const { next, ejecutar } = correr(['receta.ver'], ['insumo.ver', 'stock.registrar']);
    expect(ejecutar).toThrow('No tenés permiso para esta acción');
    expect(next).not.toHaveBeenCalled();
  });
});
