// Tareas programadas de sistema (vencimiento de reservas, CU-21, y de pagos,
// CU-06). Corren al arrancar la API y después cada intervalo; si una vuelta
// todavía no terminó, la siguiente se saltea para no procesar dos veces lo mismo.
export function iniciarTareaPeriodica(
  nombre: string,
  tarea: () => Promise<unknown>,
  intervaloMs = 60_000,
): () => void {
  let corriendo = false;

  async function vuelta() {
    if (corriendo) return;
    corriendo = true;
    try {
      await tarea();
    } catch (e) {
      console.error(`Error en la tarea ${nombre}`, e);
    } finally {
      corriendo = false;
    }
  }

  void vuelta();
  const intervalo = setInterval(() => void vuelta(), intervaloMs);
  return () => clearInterval(intervalo);
}
