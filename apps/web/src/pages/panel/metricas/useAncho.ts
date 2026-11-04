import { useEffect, useRef, useState } from 'react';

// Ancho en píxeles de un contenedor, para dibujar el SVG a su tamaño real y no escalarlo.
export function useAncho<T extends HTMLElement>(inicial = 320) {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setAncho(el.clientWidth || inicial);
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada) setAncho(Math.round(entrada.contentRect.width) || inicial);
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, [inicial]);
  return [ref, ancho] as const;
}
