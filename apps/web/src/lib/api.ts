import { API_PREFIX, type InformeCalidad } from '@pgim/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detalles?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// La cookie de sesión viaja sola: el front y la API comparten origen (proxy de Vite).
export async function api<T>(ruta: string, opciones: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${API_PREFIX}${ruta}`, {
    method: opciones.method ?? 'GET',
    headers: opciones.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  });
  return leerRespuesta<T>(res);
}

// Sube un archivo como cuerpo binario (PUT), sin multipart.
export async function subirArchivo<T>(ruta: string, archivo: Blob) {
  const res = await fetch(`${API_PREFIX}${ruta}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: archivo,
  });
  return leerRespuesta<T>(res);
}

// Sube el video de un escaneo (POST binario). El informe de calidad viaja en el
// encabezado X-Calidad-Video: JSON en UTF-8 codificado en base64url, sin relleno.
export async function enviarVideo<T>(ruta: string, archivo: Blob, informe: InformeCalidad) {
  const bytes = new TextEncoder().encode(JSON.stringify(informe));
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  const codificado = btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const res = await fetch(`${API_PREFIX}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Calidad-Video': codificado },
    body: archivo,
  });
  return leerRespuesta<T>(res);
}

async function leerRespuesta<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;

  const datos: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const mensaje =
      datos && typeof datos === 'object' && 'error' in datos && typeof datos.error === 'string'
        ? datos.error
        : 'No se pudo conectar con el servidor';
    const detalles =
      datos && typeof datos === 'object' && 'detalles' in datos ? datos.detalles : undefined;
    throw new ApiError(res.status, mensaje, detalles);
  }
  return datos as T;
}
