import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { z } from 'zod';
import {
  EVENTOS_SOCKET,
  salaComensal,
  salaPersonal,
  salaSucursal,
  type Sesion,
} from '@pgim/shared';
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

// Salas a las que entra una sesión al conectarse: el comensal, a la suya; el
// personal, a la de su sucursal de trabajo y, si opera la cocina o el stock, a
// la del personal (cola y alertas, con datos que no ve el comensal).
export function salasDeSesion(sesion: Sesion): string[] {
  if (sesion.usuario.tipo === 'COMENSAL') return [salaComensal(sesion.usuario.id)];
  const sucursal = sesion.sucursalActiva;
  if (!sucursal) return [];
  const salas = [salaSucursal(sucursal.id)];
  if (sesion.permisos.includes('pedido.ver') || sesion.permisos.includes('stock.registrar')) {
    salas.push(salaPersonal(sucursal.id));
  }
  return salas;
}

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
    void socket.join(salasDeSesion(sesion));

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
