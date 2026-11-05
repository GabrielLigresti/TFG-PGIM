import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { UMBRALES_POR_DEFECTO, type UmbralesCalidad } from '@pgim/shared';
import type { FormatoVideo } from '../lib/mp4';
import type { Proveedor3D, ResultadoEscaneo } from './proveedor-3d';

// Proveedor de demo: no mira el video; tras una demora devuelve uno de los
// modelos de prisma/modelos-demo (o una falla, si se fuerza).

const PREFIJO = 'sim-';
const CARPETA_DEMO = path.resolve(__dirname, '../../prisma/modelos-demo');

export interface OpcionesSimulado {
  demoraMs?: number;
  fallar?: boolean;
  ahora?: () => number;
  carpetaModelos?: string;
}

export class ProveedorSimulado implements Proveedor3D {
  readonly nombre = 'simulado';
  private readonly demoraMs: number;
  private readonly fallar: boolean;
  private readonly ahora: () => number;
  private readonly carpetaModelos: string;

  constructor(opciones: OpcionesSimulado = {}) {
    this.demoraMs = opciones.demoraMs ?? 20000;
    this.fallar = opciones.fallar ?? false;
    this.ahora = opciones.ahora ?? Date.now;
    this.carpetaModelos = opciones.carpetaModelos ?? CARPETA_DEMO;
  }

  requisitos(): UmbralesCalidad {
    return UMBRALES_POR_DEFECTO;
  }

  async iniciar(_video: Buffer, _formato: FormatoVideo): Promise<string> {
    return `${PREFIJO}${this.ahora()}`;
  }

  async consultar(tareaId: string): Promise<ResultadoEscaneo> {
    const t = tareaId.startsWith(PREFIJO) ? Number(tareaId.slice(PREFIJO.length)) : NaN;
    if (!Number.isFinite(t)) {
      return { estado: 'FALLIDO', motivo: 'No encontramos el escaneo' };
    }
    if (this.ahora() - t < this.demoraMs) return { estado: 'EN_PROCESO' };
    if (this.fallar) {
      return { estado: 'FALLIDO', motivo: 'No pudimos armar el modelo con este video' };
    }
    const archivo = t % 2 === 0 ? 'flan.glb' : 'bife.glb';
    return { estado: 'LISTO', glb: await readFile(path.join(this.carpetaModelos, archivo)) };
  }
}
