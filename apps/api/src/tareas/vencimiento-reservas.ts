// CU-21 (parte de reservas): tarea programada que vence las reservas
// pendientes cuyo comensal no llegó dentro de la tolerancia. Corre al arrancar
// la API y después cada intervalo; si una vuelta todavía no terminó, la
// siguiente se saltea para no procesar dos veces las mismas reservas.
export function iniciarVencimientoReservas(
  vencer: () => Promise<number>,
  intervaloMs = 60_000,
): () => void {
  let corriendo = false;

  async function vuelta() {
    if (corriendo) return;
    corriendo = true;
    try {
      await vencer();
    } catch (e) {
      console.error('Error al vencer reservas', e);
    } finally {
      corriendo = false;
    }
  }

  void vuelta();
  const intervalo = setInterval(() => void vuelta(), intervaloMs);
  return () => clearInterval(intervalo);
}
