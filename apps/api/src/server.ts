import { createServer } from 'node:http';
import { createApp } from './app';
import { busEventos } from './domain/eventos';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { createSocketServer } from './realtime/socket';

const httpServer = createServer(createApp());
// El mismo bus que usan los servicios: los avisos salen después de cada escritura.
const io = createSocketServer(httpServer, busEventos);

httpServer.listen(env.PORT, () => {
  console.log(`API escuchando en http://localhost:${env.PORT}`);
});

async function shutdown() {
  await io.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
