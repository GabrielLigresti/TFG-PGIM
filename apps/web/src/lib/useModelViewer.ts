import { useEffect, useState } from 'react';

// model-viewer pesa (incluye three.js): se carga recién cuando una pantalla lo usa.
export function useModelViewer() {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    void import('@google/model-viewer').then(() => setListo(true));
  }, []);
  return listo;
}
