import { useState } from 'react';
import { ApiError, api } from './api';

// Envía un alta, edición o baja y deja a mano el error de la API para mostrarlo
// en el formulario. Devuelve { datos } si salió bien (una baja responde 204, sin
// datos) o null si falló.
export function useGuardar() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detalles, setDetalles] = useState<unknown>(null);

  async function enviar<T>(
    ruta: string,
    method: string,
    body?: unknown,
  ): Promise<{ datos: T } | null> {
    setEnviando(true);
    setError(null);
    setDetalles(null);
    try {
      return { datos: await api<T>(ruta, { method, body }) };
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar');
      if (e instanceof ApiError) setDetalles(e.detalles);
      return null;
    } finally {
      setEnviando(false);
    }
  }

  return { enviar, enviando, error, detalles, setError };
}
