import { API_PREFIX } from '@pgim/shared';

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
