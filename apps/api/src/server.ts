import { createServer } from 'node:http';
import { createApp } from './app';
import { busEventos } from './domain/eventos';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { alertaRepository } from './repositories/alerta.repository';
import { cuentaMesaRepository } from './repositories/cuenta-mesa.repository';
import { createSocketServer } from './realtime/socket';
import { pagoService } from './services/pago.service';
import { reservaService } from './services/reserva.service';
import { registrarGeneradorAlertas } from './suscriptores/generador-alertas';
import { registrarRegistroVisitas } from './suscriptores/registro-visitas';
import { iniciarTareaPeriodica } from './tareas/periodica';

const httpServer = createServer(createApp());
// El mismo bus que usan los servicios: los avisos salen después de cada escritura.
const io = createSocketServer(httpServer, busEventos);
// Efectos secundarios que escriben en la base: alertas de stock y visitas.
registrarGeneradorAlertas(busEventos, alertaRepository);
registrarRegistroVisitas(busEventos, cuentaMesaRepository);

// Solo arranca acá: los tests importan la app, no el servidor.
const tareas = [
  iniciarTareaPeriodica('vencer reservas', () => reservaService.vencerPendientes()),
  iniciarTareaPeriodica('vencer pagos', () => pagoService.vencerPendientes(new Date())),
];

httpServer.listen(env.PORT, () => {
  console.log(`API escuchando en http://localhost:${env.PORT}`);
});

async function shutdown() {
  tareas.forEach((detener) => detener());
  await io.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
