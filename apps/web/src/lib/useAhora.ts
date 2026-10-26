import { useEffect, useState } from 'react';

// Hora actual (ms) que se actualiza sola: para que lo que depende del reloj
// (activar, cancelar, franjas que ya empezaron) cambie sin recargar la pantalla.
export function useAhora(intervaloMs = 30_000): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), intervaloMs);
    return () => clearInterval(intervalo);
  }, [intervaloMs]);
  return ahora;
}
