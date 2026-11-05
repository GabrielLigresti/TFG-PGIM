import type { UmbralesCalidad } from '@pgim/shared';
import type { FormatoVideo } from '../lib/mp4';

// Un proveedor convierte el video de un plato en un modelo 3D. El servicio
// del escaneo lo usa solo a través de esta interfaz.

export type ResultadoEscaneo =
  | { estado: 'EN_PROCESO' }
  | { estado: 'LISTO'; glb: Buffer; usdz?: Buffer }
  | { estado: 'FALLIDO'; motivo: string };

export interface Proveedor3D {
  readonly nombre: string;
  // Lo que le exige al video para poder procesarlo.
  requisitos(): UmbralesCalidad;
  // Envía el video y devuelve el id de la tarea en el proveedor.
  iniciar(video: Buffer, formato: FormatoVideo): Promise<string>;
  consultar(tareaId: string): Promise<ResultadoEscaneo>;
}
