import { useCallback, useEffect, useState } from 'react';
import type { Escaneo } from '@pgim/shared';
import { api } from './api';

const CADA_MS = 5000;

// Último escaneo del plato: undefined mientras carga, null si no tiene ninguno.
// Mientras está generándose (PENDIENTE o PROCESANDO) vuelve a consultar cada 5 s.
export function useEscaneo(platoId: string) {
  const [escaneo, setEscaneo] = useState<Escaneo | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const consultar = () => {
      api<Escaneo | null>(`/platos/${platoId}/escaneo`)
        .then((e) => {
          if (!vigente) return;
          setEscaneo(e);
          setError(null);
          if (e && (e.estado === 'PENDIENTE' || e.estado === 'PROCESANDO')) {
            timer = setTimeout(consultar, CADA_MS);
          }
        })
        .catch(() => {
          if (!vigente) return;
          setError('No se pudo consultar el estado del modelo');
          // Un corte de red no deja la pantalla clavada: reintenta.
          timer = setTimeout(consultar, CADA_MS);
        });
    };
    consultar();
    return () => {
      vigente = false;
      clearTimeout(timer);
    };
  }, [platoId, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { escaneo, error, recargar };
}
