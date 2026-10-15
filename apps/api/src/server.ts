import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { createSocketServer } from './realtime/socket';

const httpServer = createServer(createApp());
const io = createSocketServer(httpServer);

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
