import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { z } from 'zod';
import { EVENTOS_SOCKET, salaComensal, salaSucursal, type Sesion } from '@pgim/shared';
import type { BusEventos } from '../domain/eventos';
import { COOKIE_SESION, verificarToken } from '../lib/jwt';
import { authService } from '../services/auth.service';
import { registrarNotificadores } from './notificadores';

// Lee la cookie de sesión del handshake (mismo JWT que la API REST).
export async function sesionDeCookie(cookieHeader: string | undefined): Promise<Sesion | null> {
  const par = cookieHeader
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_SESION}=`));
  if (!par) return null;
  let token: string;
  try {
    token = decodeURIComponent(par.slice(COOKIE_SESION.length + 1));
  } catch {
    return null;
  }
  const datos = verificarToken(token);
  return datos && authService.obtenerSesion(datos);
}

const idSalaSchema = z.uuid();

export function createSocketServer(httpServer: HttpServer, bus: BusEventos): Server {
  const io = new Server(httpServer);

  io.use(async (socket, next) => {
    try {
      const sesion = await sesionDeCookie(socket.handshake.headers.cookie);
      if (!sesion) return next(new Error('No autenticado'));
      socket.data.sesion = sesion;
      next();
    } catch {
      next(new Error('No autenticado'));
    }
  });

  io.on('connection', (socket) => {
    const sesion = socket.data.sesion as Sesion;
    // El comensal recibe los cambios de sus reservas; el personal, los de su
    // sucursal de trabajo.
    if (sesion.usuario.tipo === 'COMENSAL') {
      void socket.join(salaComensal(sesion.usuario.id));
    } else if (sesion.sucursalActiva) {
      void socket.join(salaSucursal(sesion.sucursalActiva.id));
    }

    // Mapa abierto de una sucursal. La sala solo emite qué mesa cambió en qué
    // franja, sin datos personales, así que cualquier sesión puede seguirla.
    socket.on(EVENTOS_SOCKET.seguirSalon, (id: unknown) => {
      if (idSalaSchema.safeParse(id).success) void socket.join(salaSucursal(id as string));
    });
    socket.on(EVENTOS_SOCKET.dejarSalon, (id: unknown) => {
      if (idSalaSchema.safeParse(id).success) void socket.leave(salaSucursal(id as string));
    });
  });

  registrarNotificadores(io, bus);
  return io;
}
