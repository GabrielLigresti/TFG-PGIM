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

// P2002 de Prisma: violación de una clave única. Los servicios validan antes,
// pero dos altas simultáneas pueden llegar igual hasta la base.
export function esClaveDuplicada(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

// P2025 de Prisma: el registro a actualizar o conectar no existe (o no es del
// tenant). Los servicios buscan antes; llega acá solo si desapareció en el medio.
export function esRegistroInexistente(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';
}
