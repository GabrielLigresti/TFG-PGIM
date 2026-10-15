import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer);

  io.on('connection', (socket) => {
    // Las salas por sucursal y por comensal se suman junto con la autenticación.
    socket.on('disconnect', () => {});
  });

  return io;
}
