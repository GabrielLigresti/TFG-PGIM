// Error de negocio con el status HTTP que corresponde; el errorHandler lo
// traduce a la respuesta sin exponer detalles internos.
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
