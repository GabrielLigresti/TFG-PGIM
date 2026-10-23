// Las columnas time(0) llegan de Prisma como Date del 1970-01-01 en UTC: se
// convierten solo con getters y setters UTC para que la zona horaria no corra
// las horas.

export function aHora(fecha: Date): string {
  const hh = String(fecha.getUTCHours()).padStart(2, '0');
  const mm = String(fecha.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function deHora(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

const formatoHoraArgentina = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Hora "HH:mm" de Argentina de un instante (por ejemplo, el inicio de una franja).
export function horaArgentina(instante: Date): string {
  return formatoHoraArgentina.format(instante);
}
