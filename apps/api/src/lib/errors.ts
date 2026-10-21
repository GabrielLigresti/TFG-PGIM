// Error de negocio con el status HTTP que corresponde; el errorHandler lo
// traduce a la respuesta sin exponer detalles internos. `detalles` sirve para
// marcar errores puntuales de un formulario (por ejemplo, una línea de receta).
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detalles?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
