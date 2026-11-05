import { UMBRALES_POR_DEFECTO } from '@pgim/shared';
import { validarGlb } from '../lib/archivos-modelo';
import { ProveedorSimulado } from './proveedor-simulado';

const VIDEO = Buffer.from('video');

describe('ProveedorSimulado', () => {
  it('se llama simulado y pide los umbrales por defecto', () => {
    const p = new ProveedorSimulado();
    expect(p.nombre).toBe('simulado');
    expect(p.requisitos()).toEqual(UMBRALES_POR_DEFECTO);
  });

  it('iniciar devuelve sim-<ahora>', async () => {
    const p = new ProveedorSimulado({ ahora: () => 1000 });
    expect(await p.iniciar(VIDEO, 'mp4')).toBe('sim-1000');
  });

  it('sigue en proceso antes de la demora', async () => {
    let t = 1000;
    const p = new ProveedorSimulado({ demoraMs: 500, ahora: () => t });
    const id = await p.iniciar(VIDEO, 'mp4');
    t = 1499;
    expect(await p.consultar(id)).toEqual({ estado: 'EN_PROCESO' });
  });

  it('queda listo después de la demora, con un .glb válido y sin .usdz', async () => {
    let t = 1000;
    const p = new ProveedorSimulado({ demoraMs: 500, ahora: () => t });
    const id = await p.iniciar(VIDEO, 'mp4');
    t = 1500;
    const r = await p.consultar(id);
    expect(r.estado).toBe('LISTO');
    if (r.estado !== 'LISTO') return;
    expect(() => validarGlb(r.glb)).not.toThrow();
    expect(r.usdz).toBeUndefined();
  });

  it('alterna entre los dos modelos de demo según la paridad', async () => {
    const p = new ProveedorSimulado({ demoraMs: 0, ahora: () => 10 });
    const par = await p.consultar('sim-2');
    const impar = await p.consultar('sim-3');
    if (par.estado !== 'LISTO' || impar.estado !== 'LISTO') throw new Error('debían estar listos');
    expect(par.glb.equals(impar.glb)).toBe(false);
  });

  it('falla con el motivo cuando se fuerza la falla', async () => {
    let t = 1000;
    const p = new ProveedorSimulado({ demoraMs: 0, fallar: true, ahora: () => t });
    const id = await p.iniciar(VIDEO, 'mov');
    t = 2000;
    expect(await p.consultar(id)).toEqual({
      estado: 'FALLIDO',
      motivo: 'No pudimos armar el modelo con este video',
    });
  });

  it('un id que no es del simulado da FALLIDO', async () => {
    const p = new ProveedorSimulado();
    expect((await p.consultar('otro-123')).estado).toBe('FALLIDO');
  });
});
