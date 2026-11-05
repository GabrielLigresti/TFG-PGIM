// Escaneo del plato para generar su modelo RA (diagrama estado/escaneo-plato/v1).

export const ESTADOS_ESCANEO = [
  'PENDIENTE',
  'PROCESANDO',
  'EN_REVISION',
  'PUBLICADO',
  'DESCARTADO',
  'FALLIDO',
] as const;

export type EstadoEscaneo = (typeof ESTADOS_ESCANEO)[number];

// Tope del video que sube el restaurante (MP4 o MOV).
export const LIMITE_VIDEO_MB = 100;

export interface Escaneo {
  id: string;
  platoId: string;
  estado: EstadoEscaneo;
  // Modelo generado (borrador hasta que se publica).
  urlModelo: string | null;
  urlModeloIos: string | null;
  // Motivo de la falla, en el lenguaje del restaurante.
  error: string | null;
  creadoEn: string;
  actualizadoEn: string;
}
