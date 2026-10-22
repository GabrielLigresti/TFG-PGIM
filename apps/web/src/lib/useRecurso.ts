import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from './api';

interface Recurso<T> {
  datos: T | null;
  cargando: boolean;
  error: string | null;
  recargar(): void;
}

// Carga un recurso de la API al montar la pantalla y cada vez que se pide
// recargar (por ejemplo, después de guardar un cambio). Con ruta null no carga nada.
export function useRecurso<T>(ruta: string | null): Recurso<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(ruta !== null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (ruta === null) return;
    // Si la ruta cambia o la pantalla se desmonta antes de la respuesta, se descarta.
    let vigente = true;
    setCargando(true);
    api<T>(ruta)
      .then((respuesta) => {
        if (!vigente) return;
        setDatos(respuesta);
        setError(null);
      })
      .catch((e: unknown) => {
        if (vigente)
          setError(e instanceof ApiError ? e.message : 'No se pudo cargar la información');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [ruta, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  return { datos, cargando, error, recargar };
}
